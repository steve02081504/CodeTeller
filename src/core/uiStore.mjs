/**
 * 与文件树 / 增量重绘相关的 UI 可变状态（集中存放，便于测试与扩展）
 */
export const uiStore = {
	collapsedDirectoryPaths: /** @type {Set<string>} */ new Set(),
	fileListDirty: true,
	lastRenderedPath: '',
	lastRenderedPhase: '',
	lastPaintSignature: '',
	/** 文件树结构签名（createdPaths + 折叠），用于仅切换当前文件时做 class 增量更新 */
	lastTreeStructureSig: '',
}
