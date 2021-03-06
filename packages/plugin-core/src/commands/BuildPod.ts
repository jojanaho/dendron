import { BuildSiteCommand } from "@dendronhq/dendron-cli";
import _ from "lodash";
import { window } from "vscode";
import { DendronWorkspace } from "../workspace";
import { BasicCommand } from "./base";
import { ReloadIndexCommand } from "./ReloadIndex";

type CommandOpts = {};

type CommandOutput = void;

export class BuildPodCommand extends BasicCommand<
  CommandOpts,
  CommandOutput
> {

  async execute(opts: CommandOpts) {
    const ctx = { ctx: "PlantNotesCommand" };
    const {} = _.defaults(opts, {});
    const ws = DendronWorkspace.instance();
    // TODO: HACK, need to actually track changes
    const engine = await new ReloadIndexCommand().execute();
    const config = ws.config?.site;
    if (_.isUndefined(config)) {
      throw Error("no config found");
    }
    const cmd = new BuildSiteCommand();
    // @ts-ignore
    cmd.L = this.L;
    const dendronRoot = DendronWorkspace.rootDir();
    if (_.isUndefined(dendronRoot)) {
      throw Error("dendronRoot note set");
    }
    this.L.info({ ...ctx, config });
    await cmd.execute({ engine, config, dendronRoot });
    window.showInformationMessage("finished");
  }
}
