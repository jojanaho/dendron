import { getStage } from "@dendronhq/common-all";
import _ from "lodash";
import semver from "semver";
import * as vscode from "vscode";
import { DENDRON_COMMANDS, GLOBAL_STATE, WORKSPACE_STATE } from "./constants";
import { Logger } from "./logger";
import { HistoryService } from "./services/HistoryService";
import { VSCodeUtils } from "./utils";
import { DendronWorkspace } from "./workspace";
import fs from "fs-extra";
import { MarkdownUtils } from "./utils/md";
import { getOS } from "./utils/system";
import { Extensions } from "./settings";
import { DendronTreeView } from "./views/DendronTreeView";

// === Main
// this method is called when your extension is activated
export function activate(context: vscode.ExtensionContext) {
  const stage = getStage();
  DendronTreeView.register(context);
  if (stage !== "test") {
    _activate(context);
  }
  return;
}

export async function _activate(context: vscode.ExtensionContext) {
  const isDebug = VSCodeUtils.isDebuggingExtension();
  const ctx = "activate";
  const stage = getStage();
  const { logPath, extensionPath, extensionUri, storagePath } = context;

  Logger.configure(context, "debug");
  Logger.info({
    ctx,
    stage,
    isDebug,
    logPath,
    extensionPath,
    extensionUri,
    storagePath,
  });
  // needs to be initialized to setup commands
  const ws = DendronWorkspace.getOrCreate(context, {
    skipSetup: stage === "test",
  });

  const installedGlobalVersion = DendronWorkspace.version();
  const migratedGlobalVersion = context.globalState.get<string | undefined>(
    GLOBAL_STATE.VERSION
  );
  const previousGlobalVersion = ws.context.globalState.get<string>(
    GLOBAL_STATE.VERSION_PREV
  );
  const previousWsVersion = context.workspaceState.get<string>(
    WORKSPACE_STATE.WS_VERSION
  );
  // stats
  const platform = getOS();
  const extensions = Extensions.getVSCodeExtnsion().map(
    ({ id, extension: ext }) => {
      return {
        id,
        version: ext?.packageJSON?.version,
        active: ext?.isActive,
      };
    }
  );
  Logger.info({
    ctx,
    installedGlobalVersion,
    migratedGlobalVersion,
    previousGlobalVersion,
    previousWsVersion,
    platform,
    extensions,
  });

  if (DendronWorkspace.isActive()) {
    Logger.info({ msg: "reloadWorkspace:pre" });
    ws.reloadWorkspace().then(async () => {
      Logger.info({ ctx, msg: "dendron ready" }, true);
      // help with debug
      fs.readJSON(DendronWorkspace.workspaceFile().fsPath).then((config) => {
        Logger.info({ ctx, msg: "gotConfig", config });
      });
      // check if first time install workspace, if so, show tutorial
      if (
        _.isUndefined(
          context.globalState.get<string | undefined>(
            GLOBAL_STATE.DENDRON_FIRST_WS
          )
        )
      ) {
        Logger.info({ ctx, msg: "first dendron ws, show welcome" });
        const welcomeUri = vscode.Uri.joinPath(
          ws.rootWorkspace.uri,
          "dendron.quickstart.md"
        );
        if (getStage() !== "test" && fs.pathExistsSync(welcomeUri.fsPath)) {
          await vscode.window.showTextDocument(welcomeUri);
          await MarkdownUtils.openPreview({ reuseWindow: false });
        }
        await ws.updateGlobalState("DENDRON_FIRST_WS", "initialized");
      }
      HistoryService.instance().add({
        source: "extension",
        action: "initialized",
      });
      vscode.window.showInformationMessage("Dendron is active");
      if (isDebug || stage === "test") {
        Logger.output?.show(false);
        vscode.window.showInformationMessage("activate");
      }
      Logger.info({ ctx, msg: "finish reloadWorkspace" });
    });

    // first time install
    if (previousGlobalVersion === "0.0.0") {
      Logger.info({ ctx, msg: "no previous global version" });
      vscode.commands
        .executeCommand(DENDRON_COMMANDS.UPGRADE_SETTINGS.key)
        .then((changes) => {
          Logger.info({ ctx, msg: "postUpgrade: new wsVersion", changes });
        });
      context.workspaceState.update(
        WORKSPACE_STATE.WS_VERSION,
        DendronWorkspace.version()
      );
    } else if (_.isUndefined(previousWsVersion)) {
      // USED To do something here, no longer do
      Logger.info({ ctx, msg: "first init workspace, do nothing" });
      context.workspaceState.update(
        WORKSPACE_STATE.WS_VERSION,
        DendronWorkspace.version()
      );
    } else {
      if (semver.lt(previousWsVersion, DendronWorkspace.version())) {
        Logger.info({ ctx, msg: "preUpgrade: new wsVersion" });
        vscode.commands
          .executeCommand(DENDRON_COMMANDS.UPGRADE_SETTINGS.key)
          .then((changes) => {
            Logger.info({ ctx, msg: "postUpgrade: new wsVersion", changes });
            context.workspaceState.update(
              WORKSPACE_STATE.WS_VERSION,
              DendronWorkspace.version()
            );
          });
      } else {
        Logger.info({ ctx, msg: "same wsVersion" });
      }
    }
    Logger.info({ ctx, msg: "exit" });
  } else {
    Logger.info({ ctx: "dendron not active" });
  }

  showWelcomeOrWhatsNew(DendronWorkspace.version(), migratedGlobalVersion).then(
    () => {
      HistoryService.instance().add({
        source: "extension",
        action: "activate",
      });
    }
  );
}

// this method is called when your extension is deactivated
export function deactivate() {
  const ctx = "deactivate";
  const ws = DendronWorkspace.instance();
  ws.deactivate();
  ws.L.info({ ctx });
}

async function showWelcomeOrWhatsNew(
  version: string,
  previousVersion: string | undefined
) {
  const ctx = "showWelcomeOrWhatsNew";
  Logger.info({ ctx, version, previousVersion });
  const ws = DendronWorkspace.instance();
  if (_.isUndefined(previousVersion)) {
    Logger.info({ ctx, msg: "first time install" });
    // NOTE: this needs to be from extension because no workspace might exist at this point
    const uri = vscode.Uri.joinPath(
      ws.context.extensionUri,
      "assets",
      "dendronWS",
      "vault",
      "dendron.welcome.md"
    );
    await ws.context.globalState.update(GLOBAL_STATE.VERSION, version);
    await ws.context.globalState.update(GLOBAL_STATE.VERSION_PREV, "0.0.0");
    await ws.showWelcome(uri, { reuseWindow: true });
  } else {
    Logger.info({ ctx, msg: "not first time install" });
    if (version !== previousVersion) {
      Logger.info({ ctx, msg: "new version", version, previousVersion });
      await ws.context.globalState.update(GLOBAL_STATE.VERSION, version);
      await ws.context.globalState.update(
        GLOBAL_STATE.VERSION_PREV,
        previousVersion
      );
      vscode.window
        .showInformationMessage(
          `Dendron has been upgraded to ${version} from ${previousVersion}`,
          "See what changed"
        )
        .then((resp) => {
          if (resp === "See what changed") {
            vscode.commands.executeCommand(
              "vscode.open",
              vscode.Uri.parse(
                "https://github.com/dendronhq/dendron/blob/master/CHANGELOG.md#change-log"
              )
            );
          }
        });
    }
  }
}
