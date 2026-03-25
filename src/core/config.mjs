/** 资源与展示上限（可按需改） */
export const LIMITS = {
	maxFiles: 400,
	maxFileChars: 200_000,
	maxTotalChars: 2_000_000,
	maxBlobRequests: 200,
	/** 代码区全文/光标上下文与 Shiki 高亮字符上限（与 `codeRenderer` 一致） */
	maxFullRenderChars: 12_000,
	cursorRenderContext: 3_000,
	maxHighlightChars: 8_000,
}

/** UTF-8 解码后，不可打印（Unicode 类别 C，不含 tab/LF/CR）码点占比超过该值则视为二进制并跳过 */
export const NON_PRINTABLE_RATIO_SKIP = 0.9

/**
 * UTF-8 探测/容错解码的探测上限与阈值（避免在热点路径上硬编码魔术数字）
 */
export const UTF8_PROBE_MAX_BYTES = 8_000
/**
 * UTF-8 容错解码的样本上限
 */
export const UTF8_LOOSE_SAMPLE_MAX_CHARS = 12_000
/**
 * UTF-8 容错解码的替换比例阈值
 */
export const UTF8_REPLACEMENT_RATIO_SKIP = 0.02

/**
 * 无 CORS 代理的 URL
 */
export const NOCORS_BASE = 'https://nocors.steve02081504.workers.dev/?'

/**
 * 二进制文件扩展名
 */
export const BINARY_EXT = new Set([
	'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'svgz',
	'woff', 'woff2', 'ttf', 'eot', 'otf',
	'mp3', 'mp4', 'webm', 'ogg', 'wav',
	'pdf', 'zip', 'gz', 'tgz', '7z', 'rar',
	'exe', 'dll', 'so', 'dylib', 'bin', 'wasm',
	'pyc', 'pyo', 'class', 'jar', 'o', 'a', 'obj', 'lock',
])
