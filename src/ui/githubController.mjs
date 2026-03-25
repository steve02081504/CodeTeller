/**
 * GitHub 仓库加载：表单取值、Token 持久化与拉取串联
 */

import { runWithStatus, emitStatus } from '../core/taskRunner.mjs'

/**
 * 绑定 GitHub 仓库控制
 * @param {{
 *   inputGithubUrlElement: HTMLInputElement,
 *   buttonLoadGithubElement: HTMLButtonElement,
 *   inputGithubTokenElement: HTMLInputElement,
 *   githubTokenStorageKey: string,
 *   loadGithub: (urlOrRepo: string, options: { token?: string }) => Promise<unknown[]>,
 *   onRepositoryEntriesLoaded: (entries: unknown[]) => Promise<void> | void,
 * }} options DOM 与加载回调的聚合配置
 * @returns {void}
 */
export function bindGithubRepositoryControls(options) {
	const {
		inputGithubUrlElement,
		buttonLoadGithubElement,
		inputGithubTokenElement,
		githubTokenStorageKey,
		loadGithub,
		onRepositoryEntriesLoaded,
	} = options

	/**
	 * 加载 GitHub 仓库
	 * @returns {Promise<void>}
	 */
	buttonLoadGithubElement.addEventListener('click', async () => {
		const repositoryUrl = inputGithubUrlElement.value.trim()
		if (!repositoryUrl) {
			emitStatus('ui.status.missingGithubRepo', {}, true)
			return
		}
		const token = inputGithubTokenElement.value.trim()
		if (token) localStorage.setItem(githubTokenStorageKey, token)
		else localStorage.removeItem(githubTokenStorageKey)

		const entries = await runWithStatus('ui.status.loadFromGithub', () =>
			loadGithub(repositoryUrl, { token: token || undefined }),
		)
		if (entries) await onRepositoryEntriesLoaded(entries)
	})
}
