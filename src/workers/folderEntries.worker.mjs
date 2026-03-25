/**
 * 在 Worker 中枚举并排序本地目录，按序读取文本后回传主线程（避免阻塞 UI）
 */
import { validateFileContent } from '../core/fileProcessor.mjs'
import { enumerateTextFileHandles } from '../services/localFolder.mjs'
import {
	buildScopedOrderRuleMapFromRecords,
	partitionOrderRecords,
	preprocessDirectoryEntries,
	sortPathRecordsByScopedOrderForText,
} from '../shared/DirectoryTraverser.mjs'

self.addEventListener('message', event => {
	const message = event.data
	if (message?.type !== 'START') return
	const { directoryHandle } = message

	/**
	 * 运行
	 * @returns {Promise<void>}
	 */
	const run = async () => {
		const pingInterval = self.setInterval(() => {
			self.postMessage({ type: 'PING' })
		}, 30_000)
		try {
			let records = await enumerateTextFileHandles(directoryHandle)
			records = preprocessDirectoryEntries(records)
			const { orderRecords, textRecords } = partitionOrderRecords(records)

			const orderRuleMap = await buildScopedOrderRuleMapFromRecords(orderRecords, async orderRecord => {
				const orderFile = await orderRecord.handle.getFile()
				return orderFile.text()
			})

			const sortedRecords = sortPathRecordsByScopedOrderForText(textRecords, orderRuleMap)

			for (const record of sortedRecords)
				try {
					const file = await record.handle.getFile()
					const buffer = new Uint8Array(await file.arrayBuffer())
					const text = validateFileContent(buffer, record.path)
					if (text === null) continue
					self.postMessage({
						type: 'FILE_ENTRY',
						payload: { path: record.path, content: text },
					})
				} catch (error) {
					console.warn(`[Worker] 读取跳过 ${record.path}`, error)
				}

			self.postMessage({ type: 'COMPLETE' })
		} finally {
			self.clearInterval(pingInterval)
		}
	}

	run().catch(error => {
		self.postMessage({
			type: 'ERROR',
			payload: { message: String(error?.message || error) },
		})
	})
})
