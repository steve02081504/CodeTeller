import { LIMITS, NOCORS_BASE } from '../core/config.mjs'
import { I18nError } from '../i18n/uiI18n.mjs'
import { pathHasGitSegment, isSkippedByBinaryExt, runConcurrently } from '../utils/utils.mjs'

import { walkZipBuffer, finalizeRawEntries } from './traverse.mjs'

/**
 * 文件条目
 * @typedef {{ path: string, content: string }} FileEntry
 */

const GH_API = 'https://api.github.com'

/**
 * 判断是否为 GitHub 限流
 * @param {unknown} err 任意异常
 * @returns {boolean} 是否为 GitHub 限流
 */
function isGithubRateLimitError(err) {
	const status = err?.i18nParams?.status ?? err?.status
	return String(status) === '403' || String(status) === '429'
}

/**
 * 判断是否为未授权（Token 无效等）
 * @param {unknown} err 任意异常
 * @returns {boolean} 是否为未授权（Token 无效等）
 */
function isGithubUnauthorizedError(err) {
	const status = err?.i18nParams?.status ?? err?.status
	return String(status) === '401'
}

/**
 * 规范化仓库名或 URL 片段
 * @param {string} name 仓库名或 URL 片段
 * @returns {string} 规范化后的 `owner/repo` 名
 */
function normalizeRepoName(name) {
	return String(name).replace(/\.git$/, '').replace(/\/$/, '')
}

/**
 * 解析仓库名或 URL 片段，支持完整 URL、owner/repo、末尾 .git 等各种格式
 * @param {string} urlOrRaw URL 或 `owner/repo`
 * @returns {{ owner: string, repo: string }} 解析结果
 */
function parseRepo(urlOrRaw) {
	const cleaned = normalizeRepoName(String(urlOrRaw).trim())
	try {
		const url = new URL(cleaned)
		if (url.hostname === 'github.com' || url.hostname === 'www.github.com') {
			const pathParts = url.pathname.split('/').filter(Boolean)
			if (pathParts.length >= 2)
				return { owner: pathParts[0], repo: normalizeRepoName(pathParts[1]) }
		}
	} catch {
		// 非法 URL，按 owner/repo 或 git@github.com:owner/repo 等格式继续尝试
	}
	// 兜底正则：覆盖 SSH 格式 (github.com:owner/repo) 与纯 owner/repo
	const match = cleaned.match(
		/^(?:(?:https?:\/\/(?:www\.)?github\.com\/|github\.com[/:]))?([^/]+)\/([^/#?]+)/i,
	)
	if (match) return { owner: match[1], repo: normalizeRepoName(match[2]) }
	throw new I18nError('errors.invalidGithubRepo')
}

/**
 * 构建 API 请求头
 * @param {string} [token] PAT 或 fine-grained token
 * @returns {Record<string, string>} HTTP 头
 */
function headersForApi(token) {
	const h = { Accept: 'application/vnd.github+json' }
	if (token)
		if (token.startsWith('ghp_') || token.startsWith('gho_'))
			h.Authorization = `token ${token}`
		else
			h.Authorization = `Bearer ${token}`

	return h
}

/**
 * 解码 Base64 文本为字节数组
 * @param {string} base64 Base64 文本
 * @returns {Uint8Array} 解码字节
 */
function decodeBase64ToBytes(base64) {
	return Uint8Array.from(atob(base64), c => c.charCodeAt(0))
}

/**
 * 通过 GitHub API 下载 JSON 数据
 * @param {string} url API URL
 * @param {string} [token] 可选 token
 * @param {AbortSignal} [signal] 可选中止信号
 * @returns {Promise<*>} JSON 体
 */
async function fetchJson(url, token, signal) {
	const response = await fetch(url, { headers: headersForApi(token), signal })
	if (!response.ok) {
		const bodyText = await response.text().catch(() => '')
		throw new I18nError('errors.githubApiRequestFailed', {
			status: response.status,
			detail: bodyText.slice(0, 200),
		})
	}
	return response.json()
}

/**
 * 通过代理下载 ZIP 文件
 * @param {string} url 原始下载 URL
 * @returns {Promise<ArrayBuffer>} 二进制体
 */
async function fetchArrayBufferViaNocors(url) {
	const proxied = NOCORS_BASE + encodeURIComponent(url)
	const response = await fetch(proxied)
	if (!response.ok) throw new I18nError('errors.proxyDownloadFailed', { status: response.status })
	return response.arrayBuffer()
}

/**
 * 从 ZIP 二进制解析文件条目
 * @param {ArrayBuffer} buffer ZIP 二进制
 * @returns {FileEntry[]} 解析后的文件条目
 */
function entriesFromGithubZipBuffer(buffer) {
	const raw = walkZipBuffer(buffer)
	return finalizeRawEntries(raw)
}

/**
 * 从 GitHub 下载 ZIP 文件
 * @param {string} owner 仓库所有者
 * @param {string} repo 仓库名
 * @param {string} branch 分支名
 * @returns {Promise<FileEntry[]>} 文件条目
 */
export async function loadGithubZip(owner, repo, branch) {
	const codeload = `https://codeload.github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/zip/refs/heads/${encodeURIComponent(branch)}`
	const buffer = await fetchArrayBufferViaNocors(codeload)
	return entriesFromGithubZipBuffer(buffer)
}

/**
 * REST: git/trees + git/blobs，再走与 ZIP/本地相同的 finalize
 * @param {string} owner 仓库所有者
 * @param {string} repo 仓库名
 * @param {string} token API token
 * @returns {Promise<FileEntry[]>} 文件条目
 */
export async function loadGithubApiFallback(owner, repo, token) {
	const abortController = new AbortController()
	const { signal } = abortController
	let unauthorized = false

	const repoJson = await fetchJson(`${GH_API}/repos/${owner}/${repo}`, token, signal)
	const branch = repoJson.default_branch || 'main'
	const ref = await fetchJson(`${GH_API}/repos/${owner}/${repo}/git/ref/heads/${branch}`, token, signal)
	const treeSha = ref.object.sha
	const tree = await fetchJson(`${GH_API}/repos/${owner}/${repo}/git/trees/${treeSha}?recursive=1`, token, signal)
	const blobs = (tree.tree || []).filter(
		t =>
			t.type === 'blob'
			&& t.path
			&& !pathHasGitSegment(t.path)
			&& !isSkippedByBinaryExt(t.path),
	)
	blobs.sort((a, b) => a.path.localeCompare(b.path))
	const raw = []
	const candidates = blobs
		.filter(blob => (blob.size || 0) <= LIMITS.maxFileChars * 4)
		.slice(0, LIMITS.maxBlobRequests)
	let rateLimitHit = false

	await runConcurrently(10, candidates, async candidate => {
		if (rateLimitHit || unauthorized || raw.length >= LIMITS.maxFiles) return
		try {
			const blob = await fetchJson(`${GH_API}/repos/${owner}/${repo}/git/blobs/${candidate.sha}`, token, signal)
			const base64 = String(blob.content || '').replace(/\s/g, '')
			const bytes = decodeBase64ToBytes(base64)
			if (raw.length < LIMITS.maxFiles) raw.push({ path: candidate.path, bytes })
		} catch (error) {
			if (error?.name === 'AbortError') return
			if (isGithubUnauthorizedError(error)) {
				unauthorized = true
				abortController.abort()
				return
			}
			if (isGithubRateLimitError(error)) {
				rateLimitHit = true
				abortController.abort()
				return
			}
			console.warn(`拉取文件失败 ${candidate.path}:`, error)
		}
	})
	if (unauthorized) throw new I18nError('errors.githubUnauthorized')
	if (rateLimitHit) throw new I18nError('errors.githubRateLimited')
	return finalizeRawEntries(raw)
}

/**
 * 从 GitHub 下载文件条目
 * @param {string} urlOrRepo URL 或 `owner/repo`
 * @param {{ token?: string }} [options] 可选 token
 * @returns {Promise<FileEntry[]>} 文件条目
 */
export async function loadGithub(urlOrRepo, options = {}) {
	const { owner, repo } = parseRepo(urlOrRepo)
	const token = options.token || ''

	const repoJson = await fetchJson(`${GH_API}/repos/${owner}/${repo}`, token)
	const branch = repoJson.default_branch || 'main'

	try {
		const fromZip = await loadGithubZip(owner, repo, branch)
		// 只要 ZIP 方案可用（未抛错），就优先使用 ZIP，避免触发昂贵的逐文件 API 拉取
		return fromZip
	} catch (e) {
		console.warn('ZIP 路径失败，改用 API:', e)
	}
	return loadGithubApiFallback(owner, repo, token)
}

/**
 * 解析 GitHub 仓库坐标（见 `parseRepo` 实现）
 * @returns {{ owner: string, repo: string }} 解析结果
 */
export { parseRepo }
