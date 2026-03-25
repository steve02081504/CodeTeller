/**
 * 文本解码管道：字节 → 可展示正文（与 utils 对齐，便于单独测试与 Worker 复用概念）
 */
export { decodeBytesToText, isMostlyNonPrintable } from './utils.mjs'
