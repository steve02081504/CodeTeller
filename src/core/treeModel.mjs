/**
 * 由「已创建路径 + 当前路径」构建扁平树行列表（与 DOM 一一对应）
 */

/**
 * 树项
 * @typedef {{
 *   name: string,
 *   path: string,
 *   depth: number,
 *   isFile: boolean,
 *   isActive: boolean,
 *   isDraft: boolean,
 * }} TreeItem
 */

/**
 * 构建树项
 * @param {{
 *   createdPaths: string[],
 *   currentPath: string,
 *   isRenamePhase: boolean,
 * }} input 播放器与重命名阶段状态
 * @returns {TreeItem[]} 扁平树行
 */
export function buildTreeItems({ createdPaths, currentPath, isRenamePhase }) {
	const set = new Set(createdPaths)
	if (currentPath) set.add(currentPath)
	const paths = [...set].filter(Boolean).sort((a, b) => a.localeCompare(b))
	const root = { name: '', path: '', isFile: false, children: new Map() }
	for (const p of paths) {
		const parts = p.split('/').filter(Boolean)
		let cur = root
		let full = ''
		for (let i = 0; i < parts.length; i++) {
			const seg = parts[i]
			full = full ? `${full}/${seg}` : seg
			if (!cur.children.has(seg))
				cur.children.set(seg, {
					name: seg,
					path: full,
					isFile: i === parts.length - 1,
					children: new Map(),
				})

			cur = cur.children.get(seg)
		}
	}
	const out = []
	/**
	 * 遍历树节点
	 * @param {{ name: string, path: string, isFile: boolean, children: Map<string, any> }} node 树节点
	 * @param {number} depth 深度
	 * @returns {void}
	 */
	function walk(node, depth) {
		const arr = [...node.children.values()].sort((a, b) => {
			if (a.isFile !== b.isFile) return a.isFile ? 1 : -1
			return a.name.localeCompare(b.name)
		})
		for (const n of arr) {
			out.push({
				name: n.name,
				path: n.path,
				depth,
				isFile: n.isFile,
				isActive: n.path === currentPath,
				isDraft: n.path === currentPath && isRenamePhase,
			})
			if (!n.isFile) walk(n, depth + 1)
		}
	}
	walk(root, 0)
	return out
}
