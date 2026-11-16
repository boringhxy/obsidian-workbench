import Foundation
import EventKit
import CryptoKit

struct Target: Codable, Equatable { let id: String; let title: String; let source: String; let tags: String }
struct Manifest: Codable { let schemaVersion: Int; let expectedCount: Int; let originalCreationUnix: Double; let creationLogID: String; let evidenceSHA256: String; let evidenceRelativePath: String; let targets: [Target] }
struct Snapshot: Codable {
 let id: String; let title: String; let source: String; let calendarID: String; let calendarTitle: String
 let notes: String?; let url: String?; let priority: Int; let completed: Bool; let creationUnix: Double?; let modifiedUnix: Double?
}
struct Skipped: Codable { let id: String; let title: String; let reason: String }
struct Receipt: Codable { let timestamp: String; let candidates: [Snapshot]; let skipped: [Skipped]; var deletedIDs: [String]; var restoredIDs: [String: String] }
enum CleanupError: LocalizedError {
 case message(String)
 var errorDescription: String? { switch self { case .message(let text): return text } }
}
let taskPath = "/工具/个人工作台/待办收件箱.md"
let fm = FileManager.default
func backupDirectory() -> URL { fm.homeDirectoryForCurrentUser.appendingPathComponent("Documents/ObsidianWorkbenchBackups/ReminderCleanup") }
func json(_ url: URL) throws -> [String: Any] {
 guard let result = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any] else { throw CleanupError.message("配置文件格式异常") }; return result
}
func save(_ receipt: Receipt, to url: URL) throws {
 let encoder = JSONEncoder(); encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
 try encoder.encode(receipt).write(to: url, options: .atomic)
 try fm.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
}
func parseTarget(_ mapping: [String: Any]) throws -> Target {
 guard let id = mapping["remindersId"] as? String, let encoded = mapping["obsidianId"] as? String,
       let bytes = Data(base64Encoded: encoded), let decoded = String(data: bytes, encoding: .utf8),
       let first = decoded.firstIndex(of: "|"), let last = decoded.lastIndex(of: "|"), first != last else { throw CleanupError.message("历史索引格式异常") }
 return Target(id: id, title: String(decoded[decoded.index(after: first)..<last]), source: String(decoded[..<first]), tags: String(decoded[decoded.index(after: last)...]))
}
func validate(_ manifest: Manifest, base: URL) throws -> Set<String> {
 guard manifest.schemaVersion == 1, manifest.expectedCount > 0, manifest.expectedCount <= 100, manifest.targets.count == manifest.expectedCount,
       Set(manifest.targets.map(\.id)).count == manifest.expectedCount else { throw CleanupError.message("清单数量无效、超过100条或包含重复编号") }
 let evidence = base.appendingPathComponent(manifest.evidenceRelativePath).resolvingSymlinksInPath().standardizedFileURL
 guard evidence.path.hasPrefix(base.resolvingSymlinksInPath().path + "/") else { throw CleanupError.message("历史证据路径越界") }
 let evidenceData = try Data(contentsOf: evidence)
 let digest = SHA256.hash(data: evidenceData).map { String(format: "%02x", $0) }.joined()
 guard digest == manifest.evidenceSHA256 else { throw CleanupError.message("历史备份发生变化，停止清理") }
 let state = try json(evidence)
 guard let rows = state["mappings"] as? [[String: Any]] else { throw CleanupError.message("缺少历史关联") }
 let targetIDs = Set(manifest.targets.map(\.id))
 let historical = try rows.map(parseTarget).filter { $0.source != taskPath && targetIDs.contains($0.id) }
 guard historical.count == manifest.expectedCount, historical.sorted(by: { $0.id < $1.id }) == manifest.targets.sorted(by: { $0.id < $1.id }) else { throw CleanupError.message("清单与原始误同步编号不一致") }
 let profiles = try json(base.appendingPathComponent("profiles.json"))
 guard let active = profiles["activeProfileId"] as? String, active.range(of: "^[A-Za-z0-9-]+$", options: .regularExpression) != nil,
       let all = profiles["profiles"] as? [[String: Any]] else { throw CleanupError.message("当前同步配置异常") }
 let enabled = all.filter { $0["enabled"] as? Bool == true }
 guard enabled.count == 1, enabled[0]["id"] as? String == active,
       let config = enabled[0]["config"] as? [String: Any],
       config["includedFolders"] as? [String] == ["工具/个人工作台"], config["defaultList"] as? String == "工作台" else { throw CleanupError.message("请保持只启用当前工作台配置，且扫描范围只包含工作台文件夹") }
 let current = try json(base.appendingPathComponent("sync_state_" + active + ".json"))
 guard let mappings = current["mappings"] as? [[String: Any]] else { throw CleanupError.message("无法核对正常工作台任务") }
 let protected = Set(mappings.compactMap { $0["remindersId"] as? String })
 guard protected.isDisjoint(with: Set(manifest.targets.map(\.id))) else { throw CleanupError.message("发现与正常任务重叠的编号，已停止") }
 return protected
}
func allowed() -> Bool {
 if #available(macOS 14.0, *) { return EKEventStore.authorizationStatus(for: .reminder) == .fullAccess }
 return EKEventStore.authorizationStatus(for: .reminder) == .authorized
}
func authorize(_ store: EKEventStore) async throws {
 if allowed() { return }
 guard EKEventStore.authorizationStatus(for: .reminder) == .notDetermined else { throw CleanupError.message("没有提醒事项访问权限。请在系统设置→隐私与安全性→提醒事项中允许本清理工具，再运行。") }
 let granted: Bool
 if #available(macOS 14.0, *) { granted = try await store.requestFullAccessToReminders() }
 else { granted = try await store.requestAccess(to: .reminder) }
 guard granted && allowed() else { throw CleanupError.message("未获得提醒事项访问权限，未执行清理") }
}
func scan(_ store: EKEventStore, manifest: Manifest) -> ([EKReminder], [Snapshot], [Skipped]) {
 var reminders: [EKReminder] = [], snapshots: [Snapshot] = [], skipped: [Skipped] = []
 for target in manifest.targets {
  guard let reminder = store.calendarItem(withIdentifier: target.id) as? EKReminder else { skipped.append(Skipped(id: target.id, title: target.title, reason: "编号已不存在，未按标题寻找其他提醒")); continue }
  var reason: String?
  if reminder.title.precomposedStringWithCanonicalMapping != target.title.precomposedStringWithCanonicalMapping { reason = "标题已经变化，保留供你核对" }
  else if !reminder.calendar.allowsContentModifications { reason = "清单不可修改" }
  else if reminder.isCompleted || reminder.priority != 0 || reminder.dueDateComponents != nil || reminder.startDateComponents != nil || !(reminder.alarms ?? []).isEmpty || !(reminder.recurrenceRules ?? []).isEmpty { reason = "已添加完成状态、日期、优先级或提醒规则，保留供你核对" }
  else if let created = reminder.creationDate, abs(created.timeIntervalSince1970 - manifest.originalCreationUnix) > 3600 { reason = "创建时间与原误同步时间不符" }
  let permittedNotes = target.tags.isEmpty ? [] : ["Tags: " + target.tags, target.tags]
  if reason == nil, let notes = reminder.notes, !notes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, !permittedNotes.contains(notes) { reason = "备注已有其他内容，保留供你核对" }
  if let reason = reason { skipped.append(Skipped(id: target.id, title: target.title, reason: reason)); continue }
  reminders.append(reminder)
  snapshots.append(Snapshot(id: target.id, title: reminder.title, source: target.source, calendarID: reminder.calendar.calendarIdentifier, calendarTitle: reminder.calendar.title, notes: reminder.notes, url: reminder.url?.absoluteString, priority: reminder.priority, completed: reminder.isCompleted, creationUnix: reminder.creationDate?.timeIntervalSince1970, modifiedUnix: reminder.lastModifiedDate?.timeIntervalSince1970))
 }
 return (reminders, snapshots, skipped)
}
@main struct Cleanup {
 static func main() async {
  do {
   let args = CommandLine.arguments
   if args.contains("--permission-status") { print("REMINDERS_AUTHORIZATION=" + String(EKEventStore.authorizationStatus(for: .reminder).rawValue)); return }
   guard args.count == 3, ["--apply", "--preview", "--restore", "--restore-latest", "--validate-only"].contains(args[1]) else { throw CleanupError.message("用法：cleanup --preview/--apply targets.json；或 cleanup --restore 备份记录.json") }
   var input = URL(fileURLWithPath: args[2]).standardizedFileURL
   if args[1] == "--validate-only" {
    let manifest = try JSONDecoder().decode(Manifest.self, from: Data(contentsOf: input))
    let base = fm.homeDirectoryForCurrentUser.appendingPathComponent("Library/Containers/com.remindian.app/Data/Library/Application Support/Remindian")
    let protected = try validate(manifest, base: base)
    print("只读核对通过：\(manifest.expectedCount)条误同步编号有原始证据，正常工作台\(protected.count)条关联无重叠；没有访问或删除系统提醒事项。"); return
   }
   if args[1] == "--restore-latest" {
    let folder = backupDirectory()
    let candidates = try fm.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil).filter { $0.pathExtension == "json" }.sorted { $0.lastPathComponent > $1.lastPathComponent }
    guard let latest = candidates.first(where: { url in
     guard let data = try? Data(contentsOf: url), let receipt = try? JSONDecoder().decode(Receipt.self, from: data) else { return false }; return !receipt.deletedIDs.isEmpty
    }) else { throw CleanupError.message("没有找到已执行删除的备份") }
    input = latest
   }
   let store = EKEventStore(); try await authorize(store)
   if args[1] == "--restore" || args[1] == "--restore-latest" {
    var receipt = try JSONDecoder().decode(Receipt.self, from: Data(contentsOf: input)); var count = 0
    for snapshot in receipt.candidates where receipt.deletedIDs.contains(snapshot.id) {
     if store.calendarItem(withIdentifier: snapshot.id) != nil { continue }
     if let restoredID = receipt.restoredIDs[snapshot.id], store.calendarItem(withIdentifier: restoredID) != nil { continue }
     guard let calendar = store.calendar(withIdentifier: snapshot.calendarID), calendar.allowsContentModifications else { throw CleanupError.message("原清单不存在或不可写，停止恢复") }
     let reminder = EKReminder(eventStore: store); reminder.calendar = calendar; reminder.title = snapshot.title; reminder.notes = snapshot.notes; reminder.url = snapshot.url.flatMap(URL.init(string:)); reminder.priority = snapshot.priority; reminder.isCompleted = snapshot.completed
     try store.save(reminder, commit: true); receipt.restoredIDs[snapshot.id] = reminder.calendarItemIdentifier; try save(receipt, to: input); count += 1
    }
    print("已恢复 \(count) 条备份提醒。恢复会产生新的系统编号，重复运行会跳过已经恢复的条目。"); return
   }
   let manifest = try JSONDecoder().decode(Manifest.self, from: Data(contentsOf: input))
   let base = fm.homeDirectoryForCurrentUser.appendingPathComponent("Library/Containers/com.remindian.app/Data/Library/Application Support/Remindian")
   let protected = try validate(manifest, base: base)
   let (reminders, snapshots, skipped) = scan(store, manifest: manifest)
   print("核对误同步编号\(manifest.expectedCount)条，准备清理\(reminders.count)条，跳过\(skipped.count)条；正常工作台关联\(protected.count)条受保护。")
   for item in skipped { print("保留：\(item.title) — \(item.reason)") }
   if args[1] == "--preview" { print("仅预览，没有删除。"); return }
   let backupDir = backupDirectory()
   try fm.createDirectory(at: backupDir, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
   let stamp = ISO8601DateFormatter().string(from: Date()).replacingOccurrences(of: ":", with: "-")
   let backup = backupDir.appendingPathComponent("提醒清理备份-" + stamp + "-" + UUID().uuidString.prefix(8) + ".json")
   var receipt = Receipt(timestamp: ISO8601DateFormatter().string(from: Date()), candidates: snapshots, skipped: skipped, deletedIDs: [], restoredIDs: [:]); try save(receipt, to: backup)
   _ = try validate(manifest, base: base)
   do { for reminder in reminders { try store.remove(reminder, commit: false) }; try store.commit() } catch { store.reset(); throw error }
   receipt.deletedIDs = snapshots.map(\.id); try save(receipt, to: backup); store.reset()
   let remaining = snapshots.filter { store.calendarItem(withIdentifier: $0.id) != nil }
   print("已提交清理\(snapshots.count)条；本机按原编号复查剩余\(remaining.count)条。")
   print("备份与执行记录：" + backup.path)
   if !remaining.isEmpty { print("仍有原编号可见，请保留执行记录继续核对，不要按标题批量删除。") }
  } catch { fputs("清理未全部完成：\(error.localizedDescription)\n", stderr); exit(1) }
 }
}
