/**
 * 获取目录前缀与文件名
 * @param {string} path 文件路径（可含 `/`）
 * @returns {{ directory: string, fileName: string }} 目录前缀与文件名
 */
export function getDirectoryAndFileName(path) {
	const lastSlashIndex = path.lastIndexOf('/')
	if (lastSlashIndex < 0) return { directory: '', fileName: path }
	return { directory: path.slice(0, lastSlashIndex), fileName: path.slice(lastSlashIndex + 1) }
}

/**
 * 给定文件路径，返回其各层祖先目录前缀（用于展开折叠树）
 * @param {string} path 如 `src/a/b.ts`
 * @returns {string[]} 如 `['src', 'src/a']`
 */
export function ancestorDirectoryPrefixes(path) {
	const parts = path.split('/').filter(Boolean)
	if (parts.length <= 1) return []
	const output = []
	let accumulated = ''
	for (let index = 0; index < parts.length - 1; index++) {
		accumulated = accumulated ? `${accumulated}/${parts[index]}` : parts[index]
		output.push(accumulated)
	}
	return output
}
