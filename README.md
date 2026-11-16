# Obsidian 工作台

一个直接在 Obsidian 中操作的个人工作台，把**方向、项目和具体任务**连在一起，通过独立的 [Remindian](https://github.com/Santofer/Remindian) 应用连接 Apple 提醒事项。

当前插件版本 **1.4.2**。这是项目源码与接入设计，不是 Obsidian 官方插件，也未申报社区插件市场。仓库使用合成示例，不包含个人知识库、真实任务、同步账号配置或提醒事项索引。

## 能做什么

- **今日任务**：按日期查看，添加、编辑和勾选；支持具体时间与优先级。
- **各方向推进**：默认学术研究、语言学习、个人管理、实习与发展；允许自建方向。
- **项目与学习进度**：记录当前阶段、下一步和资料入口，在项目下安排可执行任务。
- **同一份任务**：首页与项目共用一条 Markdown 任务，完成数量自动汇总。
- **打开即见**：插件加载后打开首页，也可从侧栏图标或命令面板进入。
- **白天／黑夜**：独立配色跟随 Obsidian 外观，以 `#B4513F`、`#D9B2A7`、`#2D2B2A` 为基础，搭配宋体标题与轻微纸感。
- **后台启动同步工具**：保存或勾选任务后检查Remindian，未运行时后台启动；可在首页关闭此行为。启动失败不影响任务保存。
- **提醒事项接入**：通过 Remindian 同步，显示最近同步记录；编号不会进入提醒标题，内部标签不写进提醒备注。

任务复选框保存于 `工具/个人工作台/待办收件箱.md`；项目进度保存于插件 `data.json`。长期目标属于项目，具体可以做完的一件事属于任务。“下一步”文字不会自动变成提醒。

## 安装到 Obsidian

需要 Obsidian 1.5.0 或更新版本。只有 Apple 提醒事项接入需要 macOS；其他系统可使用工作台主体，macOS专属按钮不可用。

1. 下载仓库，在 Obsidian 中关闭应用。
2. 使用 Python 3.10+运行安装检查；把示例路径换成自己的现有知识库：

```sh
python3 scripts/install.py --vault "/path/to/your/vault" --dry-run
python3 scripts/install.py --vault "/path/to/your/vault"
```

3. 重新打开 Obsidian，允许本地社区插件加载。命令面板中搜索“打开我的工作台”。

安装器会备份被修改的文件，只复制 `main.js`、`styles.css`、`manifest.json`，增加启用项，并在任务源不存在时创建空笔记。**已有任务和插件进度不会被覆盖。**安装前的快照在 `.obsidian/yu-workbench-backups/` 中。

也可以手动把这三个文件放入 `<vault>/.obsidian/plugins/yu-workbench/`，再在社区插件设置中启用。

## 接入 Apple 提醒事项

先阅读 [接入与排错说明](docs/reminders.md)，在 Remindian 中选择自己的知识库并完成系统授权。安装器不能代替系统访问授权。

配置好单独的“工作台”清单、文件夹范围和正式同步配置后，可选择让安装器启用时间、闹钟、自动同步，并迁移旧格式编号：

```sh
python3 scripts/install.py --vault "/path/to/your/vault" --enable-reminders --profile-name "工作台" --dry-run
python3 scripts/install.py --vault "/path/to/your/vault" --enable-reminders --profile-name "工作台"
```

实际写入前应退出 Obsidian 和 Remindian。重新打开两个应用，手动点一次 Remindian 主窗口右上角的 **Sync Now**，再核对一条真实任务。

**已在参考部署中验证：**Obsidian任务进入提醒事项、完成状态写回真实笔记、简洁标题同步。具体时间解析已测试；各种日期／优先级回写、系统通知准点响起和原生备注显示仍需按自己的环境验收。工作台备注目前只承诺保存在工作台；提醒事项端新建任务导入默认关闭。

## 预览与开发

```sh
python3 scripts/build.py
npm test
```

构建输出位于 `dist/`：插件安装ZIP、白天预览与黑夜预览。直接打开预览HTML即可体验；**预览只写浏览器本地存储，不连接真实Obsidian或提醒事项**。

测试仅使用仓库中的合成示例和临时目录，不需要个人知识库、GitHub令牌或Remindian权限。Node.js 20+及Python 3.10+即可，无需安装第三方运行依赖。

## 设计与维护文档

- [架构与数据设计](docs/architecture.md)
- [提醒事项配置、同步边界与排错](docs/reminders.md)
- [版本更新日志](CHANGELOG.md)
- [贡献与维护约定](CONTRIBUTING.md)
- [隐私与发布检查](docs/privacy.md)

Remindian 是独立项目，本仓库不打包其程序、源码、账号配置或运行索引。仓库暂未指定开源许可证；上传到GitHub不等于授予开放使用许可。

## 上传到自己的GitHub

仓库已初始化为Git。完成GitHub CLI登录后执行：

```sh
gh auth login --hostname github.com --web
sh scripts/publish.sh
```

脚本默认在当前登录账号下创建私有的`obsidian-workbench`仓库并推送main及版本标签；不强制覆盖远端历史。已有origin指向其他仓库时会停止。也可传入其他仓库名称。
