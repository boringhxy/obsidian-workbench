# 误同步提醒残留：原因、修复与维护工具

## 原因与影响

最初接入时扫描了整个知识库，笔记里的模板字段、资料清单等Markdown复选框被当成任务，一次创建55条提醒。收窄到工作台范围后，47条属于另外三篇笔记，与正常工作台任务没有重叠。

当时触发了单次删除数量保护。早期修复只备份并解除47条范围外关联，保留原提醒；这阻止了后续同步继续管理它们，但没有删除已经写入系统的提醒。后来用户看到大量非预期条目，确认是此前全库误导入的残留。

当前扫描范围已限定到工作台文件夹。该事故是历史导入范围和后续清理不完整造成，不是1.4.2后台启动补丁再次添加这些字段。

## 清理完成与验证边界

- 根据原始创建日志、历史索引、源笔记路径及原提醒编号识别47个目标。
- 与当前正常工作台的12条关联核对无交集。
- 工具先备份，再按系统编号和原始标题处理；已经改过内容、规则或状态的提醒会保留。
- 助手运行环境未获得EventKit授权，因此实际清理由用户在自己的终端授权执行；用户已确认清理完成。
- 本次逐条删除数量的执行记录曾出现在临时解压目录，之后未能读取，故不把“47条全部删除”表述为助手独立验证的结果。

## 之前补丁的状态

1.4.1已修复隐藏编号进入标题，并关闭内部标签备注；1.4.2已修复保存任务后未检查同步工具生命周期的缺口，并补充停滞提示。这些补丁已在main分支。当前维护工具独立于插件，不需要为了记录此次清理重新安装工作台。

## 通用清理工具

代码位于`scripts/reminders_cleanup/`。仓库没有任何真实目标清单、原提醒编号、历史索引或执行备份。它不是“一键删除全库”工具；必须提供自己的历史证据、明确的创建事件和人工确认过的来源。

先收窄正式同步范围并停用重叠配置，再列出所选历史备份里的来源：

```sh
python3 scripts/reminders_cleanup/prepare_cleanup.py \
  --historical-state "/path/to/Remindian/backups/old-state.json" \
  --list-sources
```

在本机同步日志中找到准确的成功创建事件后，指定来源生成本地清单。需要多个来源时重复`--source`；不能指定正常工作台任务源。

```sh
python3 scripts/reminders_cleanup/prepare_cleanup.py \
  --remindian-data "/path/to/Remindian" \
  --historical-state "/path/to/Remindian/backups/old-state.json" \
  --creation-log-id "CREATION_EVENT_ID" \
  --source "/notes/example.md" \
  --output cleanup-targets.local.json

sh scripts/reminders_cleanup/run.sh --validate-only cleanup-targets.local.json
sh scripts/reminders_cleanup/run.sh --preview cleanup-targets.local.json
sh scripts/reminders_cleanup/run.sh --apply cleanup-targets.local.json
```

macOS需要为此工具授予提醒事项访问权限；首次编译需要Swift命令行工具。`--validate-only`只验证文件证据，不访问系统提醒事项。`--preview`读取并展示计划，不删除。`--apply`才执行清理。

保护包括：证据SHA256、编号与原始标题、创建时间范围、当前正常任务无重叠、扫描范围一致、最多100条，以及标题／备注／日期／完成状态／优先级／闹钟／重复规则变化时跳过。找不到原编号不会退回按标题搜索。

## 持久备份与恢复

备份固定保存到`~/Documents/ObsidianWorkbenchBackups/ReminderCleanup/`，不再放进下载或临时预览目录。备份与清单只留在本机，默认访问权限为当前用户。

```sh
sh scripts/reminders_cleanup/run.sh --restore "/path/to/receipt.json"
sh scripts/reminders_cleanup/run.sh --restore-latest cleanup-targets.local.json
```

恢复仅处理执行记录中记为已删除的条目，跳过已存在／已恢复的提醒。恢复会在原清单创建新提醒，系统编号与创建时间会变化。若原清单不存在则停止，不猜测新的目标清单。

不要把本地清单或备份提交到公开仓库，不要提高自动同步删除上限或重置全部状态来清理这类历史残留。
