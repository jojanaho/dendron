import { createLogger } from "@dendronhq/common-server";
import _ from "lodash";
import path from "path";
import { Extension, extensions, window } from "vscode";
import { SettingsUpgradeOpts, WorkspaceConfig } from "../settings";
import { DendronWorkspace } from "../workspace";
import { BasicCommand } from "./base";

const L = createLogger("UpgradeSettingsCommand");

type UpgradeSettingsCommandOpts = {
  settingOpts: SettingsUpgradeOpts;
};

export class UpgradeSettingsCommand extends BasicCommand<
  UpgradeSettingsCommandOpts,
  any
> {
  async execute(opts: UpgradeSettingsCommandOpts) {
    const ctx = "execute";
    L.info({ ctx, opts });
    const config = DendronWorkspace.configuration();
    if (!config) {
      throw Error("no ws config found");
    }

    const newConfig = WorkspaceConfig.update(
      path.dirname(DendronWorkspace.workspaceFile().fsPath)
    );
    const badExtensions: Extension<any>[] =
      (newConfig.extensions.unwantedRecommendations
        ?.map((ext) => {
          return extensions.getExtension(ext);
        })
        .filter(Boolean) as Extension<any>[]) || [];
    this.L.info({ ctx, badExtensions });
    if (!_.isEmpty(badExtensions)) {
      const msg = [
        "Manual action needed!",
        "The following extensions need to be uninstalled: ",
      ]
        .concat([
          badExtensions.map((ext) => ext.packageJSON.displayName).join(", "),
        ])
        .concat([
          "- Reload the window afterwards and Dendron will offer to install the Dendron version of the extension",
        ]);
      console.log(msg);
      window.showWarningMessage(msg.join(" "));
    }
  }
}
