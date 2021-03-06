import { BackfillCommand } from "@dendronhq/dendron-cli";
import fs from "fs-extra";
import _ from "lodash";
import path from "path";
import { Uri, window } from "vscode";
import { DendronWorkspace } from "../workspace";
import { BasicCommand } from "./base";
import { ReloadIndexCommand } from "./ReloadIndex";

type Finding = {
  issue: string;
  fix?: string;
};
type CommandOpts = {};

type CommandOutput = {
  data: Finding[];
};

export class DoctorCommand extends BasicCommand<CommandOpts, CommandOutput> {
  async execute(opts: CommandOpts) {
    const {} = _.defaults(opts, {});
    const ws = DendronWorkspace.instance();
    const rootDir = DendronWorkspace.rootDir();
    const findings: Finding[] = [];
    if (_.isUndefined(rootDir)) {
      throw Error("rootDir undefined");
    }

    const config = ws?.config;
    if (_.isUndefined(config)) {
      throw Error("no config found");
    }

    const siteRoot = path.join(rootDir, config.site.siteRootDir);
    const engine = await new ReloadIndexCommand().execute();
    await new BackfillCommand().execute({ engine });

    // create site root, used for publication
    if (!fs.existsSync(siteRoot)) {
      const f: Finding = { issue: "no siteRoot found" };
      const dendronWSTemplate = Uri.joinPath(ws.extensionAssetsDir, "dendronWS")
        .fsPath;
      const dendronSiteRoot = path.join(dendronWSTemplate, "docs");
      fs.copySync(dendronSiteRoot, siteRoot);
      f.fix = `created siteRoot at ${siteRoot}`;
      findings.push(f);
    }
    return { data: findings };
    // check for docs folrder
  }
  async showResponse(findings: CommandOutput) {
    findings.data.forEach((f) => {
      window.showInformationMessage(`issue: ${f.issue}. fix: ${f.fix}`);
    });
    window.showInformationMessage(`doctor finished checkup`);
  }
}
