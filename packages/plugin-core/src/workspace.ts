import { DendronConfig, DEngine, getStage, Note } from "@dendronhq/common-all";
import { mdFile2NodeProps, readMD } from "@dendronhq/common-server";
import { DConfig } from "@dendronhq/engine-server";
import fs from "fs-extra";
import _ from "lodash";
import open from "open";
import path from "path";
import * as vscode from "vscode";
import { ArchiveHierarchyCommand } from "./commands/ArchiveHierarchy";
import { BuildPodCommand } from "./commands/BuildPod";
import { ChangeWorkspaceCommand } from "./commands/ChangeWorkspace";
import { CopyNoteLinkCommand } from "./commands/CopyNoteLink";
import { CopyNoteRefCommand } from "./commands/CopyNoteRef";
import { CreateDailyJournalCommand } from "./commands/CreateDailyJournal";
import { CreateJournalCommand } from "./commands/CreateJournal";
import { CreateScratchCommand } from "./commands/CreateScratch";
import { DoctorCommand } from "./commands/Doctor";
import { GoUpCommand } from "./commands/GoUpCommand";
import { ImportPodV2Command } from "./commands/ImportPodV2";
import { OpenLogsCommand } from "./commands/OpenLogs";
import { RefactorHierarchyCommand } from "./commands/RefactorHierarchy";
import { ReloadIndexCommand } from "./commands/ReloadIndex";
import { RenameNoteV2Command } from "./commands/RenameNoteV2";
import { ResetConfigCommand } from "./commands/ResetConfig";
import { SetupWorkspaceCommand } from "./commands/SetupWorkspace";
import { ShowHelpCommand } from "./commands/ShowHelp";
import { ShowPreviewCommand } from "./commands/ShowPreview";
import { UpgradeSettingsCommand } from "./commands/UpgradeSettings";
import { LookupController } from "./components/lookup/LookupController";
import {
  DENDRON_COMMANDS,
  extensionQualifiedId,
  GLOBAL_STATE,
} from "./constants";
import { cacheWorkspace } from "./external/memo/utils/utils";
import { Logger } from "./logger";
import { HistoryService } from "./services/HistoryService";
import { NodeService } from "./services/nodeService/NodeService";
import { DisposableStore, resolvePath, VSCodeUtils } from "./utils";
import { isAnythingSelected } from "./utils/editor";
import { GotoNoteCommand, GotoNoteCommandOpts } from "./commands/GotoNote";
import { DendronTreeView } from "./views/DendronTreeView";

let _DendronWorkspace: DendronWorkspace | null;

export class DendronWorkspace {
  static DENDRON_WORKSPACE_FILE: string = "dendron.code-workspace";
  public dendronTreeView: DendronTreeView | undefined;

  static instance(): DendronWorkspace {
    if (!_DendronWorkspace) {
      throw Error("Dendronworkspace not initialized");
    }
    return _DendronWorkspace;
  }

  /**
   * Workspace configuration
   */
  static configuration(): vscode.WorkspaceConfiguration {
    // the reason this is static is so we can stub it for tests
    return vscode.workspace.getConfiguration();
  }

  static rootDir(): string | undefined {
    const rootDir = DendronWorkspace.configuration().get<string>(
      "dendron.rootDir"
    );
    if (rootDir) {
      return resolvePath(
        rootDir,
        path.dirname(DendronWorkspace.workspaceFile().fsPath)
      );
    }
    return rootDir;
  }

  static workspaceFile(): vscode.Uri {
    if (!vscode.workspace.workspaceFile) {
      throw Error("no workspace file");
    }
    return vscode.workspace.workspaceFile;
  }

  static workspaceFolders(): readonly vscode.WorkspaceFolder[] | undefined {
    return vscode.workspace.workspaceFolders;
  }

  static rootWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
    const wsFolders = DendronWorkspace.workspaceFolders();
    if (wsFolders) {
      return wsFolders[0];
    }
    return;
  }

  /**
   * Currently, this is a check to see if rootDir is defined in settings
   */
  static isActive(): boolean {
    return !_.isUndefined(DendronWorkspace.rootDir());
  }

  static version(): string {
    let version: string | undefined;
    if (VSCodeUtils.isDebuggingExtension()) {
      version = VSCodeUtils.getVersionFromPkg();
    } else {
      try {
        const dendronExtension = vscode.extensions.getExtension(
          extensionQualifiedId
        )!;
        version = dendronExtension.packageJSON.version;
      } catch (err) {
        version = VSCodeUtils.getVersionFromPkg();
      }
    }
    if (_.isUndefined(version)) {
      version = "0.0.0";
    }
    return version;
  }

  static async resetConfig(globalState: vscode.Memento) {
    return await Promise.all(
      _.keys(GLOBAL_STATE).map((k) => {
        const _key = GLOBAL_STATE[k as keyof typeof GLOBAL_STATE];
        return globalState.update(_key, undefined);
      })
    );
  }

  public context: vscode.ExtensionContext;
  public fsWatcher?: vscode.FileSystemWatcher;
  public L: typeof Logger;
  public _engine?: DEngine;
  private disposableStore: DisposableStore;
  private history: HistoryService;

  static getOrCreate(
    context: vscode.ExtensionContext,
    opts?: { skipSetup?: boolean }
  ) {
    if (!_DendronWorkspace) {
      _DendronWorkspace = new DendronWorkspace(context, opts);
    }
    return _DendronWorkspace;
  }

  constructor(
    context: vscode.ExtensionContext,
    opts?: { skipSetup?: boolean }
  ) {
    opts = _.defaults(opts, { skipSetup: false });
    this.context = context;
    _DendronWorkspace = this;
    this.L = Logger;
    this.disposableStore = new DisposableStore();
    this.history = HistoryService.instance();
    if (!opts.skipSetup) {
      this._setupCommands();
    }
  }

  get config(): DendronConfig {
    const rootDir = DendronWorkspace.rootDir();
    if (!rootDir) {
      throw `rootDir not set`;
    }
    return DConfig.getOrCreate(rootDir);
  }

  get engine(): DEngine {
    if (!this._engine) {
      throw Error("engine not initialized");
    }
    return this._engine;
  }

  get rootWorkspace(): vscode.WorkspaceFolder {
    const wsFolders = DendronWorkspace.workspaceFolders();
    if (_.isEmpty(wsFolders) || _.isUndefined(wsFolders)) {
      throw Error("no ws folders");
    }
    return wsFolders[0] as vscode.WorkspaceFolder;
  }

  get extensionAssetsDir(): vscode.Uri {
    const assetsDir = vscode.Uri.file(
      path.join(this.context.extensionPath, "assets")
    );
    return assetsDir;
  }

  _setupCommands() {
    this.context.subscriptions.push(
      vscode.commands.registerCommand(
        DENDRON_COMMANDS.INIT_WS.key,
        async () => {
          await new SetupWorkspaceCommand().run();
        }
      )
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand(
        DENDRON_COMMANDS.CREATE_SCRATCH_NOTE.key,
        async () => {
          await new CreateScratchCommand().run();
        }
      )
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand(
        DENDRON_COMMANDS.SHOW_PREVIEW.key,
        async () => {
          await new ShowPreviewCommand().run();
        }
      )
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand(
        DENDRON_COMMANDS.CREATE_JOURNAL_NOTE.key,
        async () => {
          await new CreateJournalCommand().run();
        }
      )
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand(
        DENDRON_COMMANDS.GOTO_NOTE.key,
        async (opts: GotoNoteCommandOpts) => {
          new GotoNoteCommand().execute(opts);
        }
      )
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand(
        DENDRON_COMMANDS.CHANGE_WS.key,
        async () => {
          await new ChangeWorkspaceCommand().run();
        }
      )
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand(
        DENDRON_COMMANDS.RESET_CONFIG.key,
        async () => {
          await new ResetConfigCommand().run();
        }
      )
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand(DENDRON_COMMANDS.LOOKUP.key, async () => {
        const ctx = DENDRON_COMMANDS.LOOKUP;
        this.L.info({ ctx: ctx + ":LookupController:pre" });
        const controller = new LookupController(this, { flavor: "note" });
        this.L.info({ ctx: ctx + ":LookupController:post" });
        controller.show();
      })
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand(
        DENDRON_COMMANDS.LOOKUP_SCHEMA.key,
        async () => {
          const controller = new LookupController(this, { flavor: "schema" });
          controller.show();
        }
      )
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand(
        DENDRON_COMMANDS.DELETE_NODE.key,
        async () => {
          const ctx = DENDRON_COMMANDS.DELETE_NODE;
          this.L.info({ ctx });
          const ns = new NodeService();
          const fsPath = VSCodeUtils.getFsPathFromTextEditor(
            VSCodeUtils.getActiveTextEditor() as vscode.TextEditor
          );

          this.history.add({
            source: "engine",
            action: "delete",
            uri: vscode.Uri.file(fsPath),
          });
          const mode = fsPath.endsWith(".md") ? "note" : "schema";
          await ns.deleteByPath(fsPath, mode);
          vscode.window.showInformationMessage(
            `${path.basename(fsPath)} deleted`
          );
        }
      )
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand(
        DENDRON_COMMANDS.OPEN_LINK.key,
        async () => {
          const ctx = DENDRON_COMMANDS.OPEN_LINK;
          this.L.info({ ctx });
          if (!isAnythingSelected()) {
            return vscode.window.showErrorMessage("nothing selected");
          }
          const { text } = VSCodeUtils.getSelection();
          const assetPath = resolvePath(text, this.rootWorkspace.uri.fsPath);
          if (!fs.existsSync(assetPath)) {
            return vscode.window.showErrorMessage(
              `${assetPath} does not exist`
            );
          }
          return open(assetPath).catch((err) => {
            vscode.window.showInformationMessage(
              "error: " + JSON.stringify(err)
            );
          });
        }
      )
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand(
        DENDRON_COMMANDS.IMPORT_POD.key,
        async () => {
          await new ImportPodV2Command().run();
        }
      )
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand(
        DENDRON_COMMANDS.RELOAD_INDEX.key,
        async (silent?: boolean) => {
          await new ReloadIndexCommand().execute();
          if (!silent) {
            vscode.window.showInformationMessage(`finish reload`);
          }
        }
      )
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand(
        DENDRON_COMMANDS.SHOW_HELP.key,
        async () => {
          await new ShowHelpCommand().execute();
        }
      )
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand(
        DENDRON_COMMANDS.OPEN_LOGS.key,
        async () => {
          try {
            await new OpenLogsCommand().execute({});
          } catch (err) {
            Logger.error(JSON.stringify(err));
          }
        }
      )
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand(
        DENDRON_COMMANDS.UPGRADE_SETTINGS.key,
        async () => {
          await new UpgradeSettingsCommand().execute({
            settingOpts: { force: true },
          });
        }
      )
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand(
        DENDRON_COMMANDS.BUILD_POD.key,
        async () => {
          await new BuildPodCommand().run();
        }
      )
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand(DENDRON_COMMANDS.DOCTOR.key, async () => {
        await new DoctorCommand().run();
      })
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand(
        DENDRON_COMMANDS.RENAME_NOTE.key,
        async () => {
          await new RenameNoteV2Command().run();
        }
      )
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand(
        DENDRON_COMMANDS.COPY_NOTE_LINK.key,
        async () => {
          await new CopyNoteLinkCommand().run();
        }
      )
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand(
        DENDRON_COMMANDS.COPY_NOTE_REF.key,
        async () => {
          await new CopyNoteRefCommand().run();
        }
      )
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand(
        DENDRON_COMMANDS.REFACTOR_HIERARCHY.key,
        async () => {
          await new RefactorHierarchyCommand().run();
        }
      )
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand(
        DENDRON_COMMANDS.ARCHIVE_HIERARCHY.key,
        async () => {
          await new ArchiveHierarchyCommand().run();
        }
      )
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand(
        DENDRON_COMMANDS.CREATE_DAILY_JOURNAL_NOTE.key,
        async () => {
          await new CreateDailyJournalCommand().run();
        }
      )
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand(
        DENDRON_COMMANDS.GO_UP_HIERARCHY.key,
        async () => {
          await new GoUpCommand().run();
        }
      )
    );
  }

  addDisposable(_disposable: vscode.Disposable) {
    // TODO
    // handle all disposables
  }

  // === Utils

  getGlobalState<T>(key: keyof typeof GLOBAL_STATE) {
    const _key = GLOBAL_STATE[key];
    return this.context.globalState.get<T>(_key);
  }

  updateGlobalState(key: keyof typeof GLOBAL_STATE, value: any) {
    const _key = GLOBAL_STATE[key];
    return this.context.globalState.update(_key, value);
  }

  // === Workspace
  /**
   * - get workspace config and workspace folder
   * - activate workspacespace watchers
   */
  async activateWorkspace() {
    const ctx = "activateWorkspace";
    let workspaceFolders: readonly vscode.WorkspaceFolder[] = [];
    const rootDir = DendronWorkspace.rootDir();
    if (!rootDir) {
      throw `rootDir not set`;
    }

    const wsFolders = DendronWorkspace.workspaceFolders();
    if (_.isUndefined(wsFolders) || _.isEmpty(wsFolders)) {
      this.L.error({
        ctx,
        msg: "no folders set for workspace",
        action: "Please set folder",
      });
      throw Error("no folders set for workspace");
    }
    workspaceFolders = wsFolders;
    if (getStage() !== "test") {
      this.createWorkspaceWatcher(workspaceFolders);
    }
  }

  async deactivate() {
    const ctx = "deactivateWorkspace";
    this.L.info({ ctx });
    this.fsWatcher?.dispose();
    this.disposableStore.dispose();
  }

  async createWorkspaceWatcher(
    workspaceFolders: readonly vscode.WorkspaceFolder[]
  ) {
    const ctx = "createWorkspaceWatcher";
    this.L.info({ ctx });
    const rootFolder = workspaceFolders[0];
    let pattern = new vscode.RelativePattern(rootFolder, "*.md");
    this.fsWatcher = vscode.workspace.createFileSystemWatcher(
      pattern,
      false,
      true,
      false
    );

    const refreshTree = _.debounce(() => {
      const ctx = "refreshTree";
      Logger.info({ ctx });
      this.dendronTreeView?.treeProvider.refresh();
    }, 100);

    this.disposableStore.add(
      this.fsWatcher.onDidCreate(async (uri: vscode.Uri) => {
        try {
          const ctx = "fsWatcher.onDidCreate";
          this.L.info({ ctx, uri });
          const fname = path.basename(uri.fsPath, ".md");
          const noteRaw = mdFile2NodeProps(uri.fsPath);
          const note = new Note({ ...noteRaw, parent: null, children: [] });

          // check if ignore
          const recentEvents = HistoryService.instance().lookBack();
          this.L.debug({ ctx, recentEvents, fname });
          if (
            _.find(recentEvents, (event) => {
              return _.every([
                event?.uri?.fsPath === uri.fsPath,
                event.source === "engine",
                event.action === "create",
              ]);
            })
          ) {
            this.L.debug({ ctx, uri, msg: "create by engine, ignoring" });
            return;
          }

          try {
            this.L.debug({ ctx, uri, msg: "adding to engine" });
            this.engine.updateNodes([note], {
              newNode: true,
              parentsAsStubs: true,
            });
          } catch (err) {
            this.L.error({ ctx, err });
          }
        } finally {
          refreshTree();
        }
      }, this)
    );

    this.disposableStore.add(
      this.fsWatcher.onDidDelete(async (uri: vscode.Uri) => {
        try {
          const ctx = "fsWatcher.onDidDelete";
          this.L.info({ ctx, uri });
          const fname = path.basename(uri.fsPath, ".md");

          // check if we should ignore
          const recentEvents = HistoryService.instance().lookBack(5);
          this.L.debug({ ctx, recentEvents, fname });
          if (
            _.find(recentEvents, (event) => {
              return _.every([
                event?.uri?.fsPath === uri.fsPath,
                event.source === "engine",
                _.includes(["delete", "rename"], event.action),
              ]);
            })
          ) {
            this.L.debug({
              ctx,
              uri,
              msg: "recent action by engine, ignoring",
            });
            return;
          }

          try {
            this.L.debug({ ctx, uri, msg: "preparing to delete" });
            const nodeToDelete = _.find(this.engine.notes, { fname });
            if (_.isUndefined(nodeToDelete)) {
              throw `${fname} not found`;
            }
            await this.engine.delete(nodeToDelete.id, "note", {
              metaOnly: true,
            });
          } catch (err) {
            // NOTE: ignore, many legitimate reasons why this might happen
            // this.L.error({ ctx, err: JSON.stringify(err) });
          }
        } finally {
          refreshTree();
        }
      }, this)
    );
  }

  /**
   * Performs a series of step to initialize the workspace
   *  Calls activate workspace
   * - initializes DendronEngine
   * @param mainVault
   */
  async reloadWorkspace(mainVault?: string) {
    // TODO: dispose of existing workspace
    await this.activateWorkspace();
    if (!mainVault) {
      const wsFolders = DendronWorkspace.workspaceFolders();
      mainVault = wsFolders![0].uri.fsPath;
    }
    try {
      await vscode.commands.executeCommand(
        DENDRON_COMMANDS.RELOAD_INDEX.key,
        true
      );
      await cacheWorkspace();
      return;
    } catch (err) {
      vscode.window.showErrorMessage(
        `error initializing dendron: ${JSON.stringify(err)}`
      );
    }
  }

  async showWelcome(
    welcomeUri?: vscode.Uri,
    _opts?: { reuseWindow?: boolean }
  ) {
    welcomeUri =
      welcomeUri ||
      vscode.Uri.joinPath(this.rootWorkspace.uri, "dendron.quickstart.md");
    try {
      const { content } = readMD(welcomeUri.fsPath);
      if (getStage() !== "test") {
        VSCodeUtils.showWebView({ title: "Welcome", content });
        //   await vscode.window.showTextDocument(welcomeUri);
        //   await MarkdownUtils.openPreview(opts);
      }
    } catch (err) {
      vscode.window.showErrorMessage(JSON.stringify(err));
    }
  }
}
