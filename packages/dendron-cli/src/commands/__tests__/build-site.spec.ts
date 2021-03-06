import { DendronSiteConfig, DEngine } from "@dendronhq/common-all";
import {
  EngineTestUtils,
  FileTestUtils,
  readMD,
} from "@dendronhq/common-server";
import { DendronEngine } from "@dendronhq/engine-server";
import fs from "fs-extra";
import _ from "lodash";
import path from "path";
import { BuildSiteCommand } from "../build-site";

describe("build-site", () => {
  let root: string;
  let engine: DEngine;
  let siteRootDir: string;
  let dendronRoot: string;
  let notesDir: string;

  beforeEach(async () => {
    root = EngineTestUtils.setupStoreDir();
    engine = DendronEngine.getOrCreateEngine({
      root,
      forceNew: true,
      mode: "exact",
    });
    siteRootDir = FileTestUtils.tmpDir().name;
    dendronRoot = root;
    notesDir = path.join(siteRootDir, "notes");
    await engine.init();
  });

  afterEach(() => {
    fs.removeSync(root);
  });

  test("basic", async () => {
    const config: DendronSiteConfig = {
      siteIndex: "root",
      siteRootDir: siteRootDir,
      siteHierarchies: ["root"],
    };
    await new BuildSiteCommand().execute({ engine, config, dendronRoot });
    const { data, content } = readMD(path.join(notesDir, "foo.md"));
    expect(data.id).toEqual("foo");
    expect(content).toMatchSnapshot("bond");
    expect(content.indexOf("- [lbl](refactor.one)") >= 0).toBe(true);
    expect(content.indexOf("SECRETS") < 0).toBe(true);
  });

  test("multiple roots", async () => {
    const config = {
      siteIndex: "root",
      siteHierarchies: ["foo", "build-site"],
      siteRootDir,
    };
    await new BuildSiteCommand().execute({ engine, config, dendronRoot });
    const dir = fs.readdirSync(notesDir);
    expect(_.includes(dir, "foo.md")).toBeTruthy();
    expect(_.includes(dir, "build-site.md")).toBeTruthy();
    expect(_.includes(dir, "refactor.one.md")).toBeFalsy();
    let { data, content } = readMD(path.join(notesDir, "foo.md"));
    expect(data.nav_order).toEqual(0);
    expect(data.parent).toBe(null);
    expect(content).toMatchSnapshot("foo.md");
    ({ data, content } = readMD(path.join(notesDir, "build-site.md")));
    expect(data.nav_order).toEqual(1);
    expect(data.parent).toBe(null);
    expect(content).toMatchSnapshot("build-site.md");
    const siteRootDirContents = fs.readdirSync(siteRootDir);
    expect(_.includes(siteRootDirContents, "assets")).toBeTruthy();
  });

  test("image prefix", async () => {
    const config = {
      siteIndex: "root",
      siteHierarchies: ["sample"],
      siteRootDir: siteRootDir,
      assetsPrefix: "fake-s3.com/",
    };
    await new BuildSiteCommand().execute({ engine, config, dendronRoot });

    const { content } = readMD(path.join(notesDir, "sample.image-link.md"));
    const dir = fs.readdirSync(siteRootDir);

    expect(content).toMatchSnapshot("sample.image-link.md");

    expect(_.includes(dir, "assets")).toBeFalsy();
    expect(_.trim(content)).toEqual("![link-alt](fake-s3.com/link-path.jpg)");
  });

  test("delete unused asset", async () => {
    const config = {
      siteIndex: "root",
      siteHierarchies: ["sample"],
      siteRootDir: siteRootDir,
    };
    await new BuildSiteCommand().execute({ engine, config, dendronRoot });
    const img = path.join(siteRootDir, "assets", "images", "foo.jpg");
    expect(fs.existsSync(img)).toBeTruthy();

    // delete image, should be gone
    const imgSrc = path.join(root, "assets", "images", "foo.jpg");
    fs.unlinkSync(imgSrc);

    await new BuildSiteCommand().execute({ engine, config, dendronRoot });
    expect(fs.existsSync(img)).toBeFalsy();
  });

  test("no publsih by default", async () => {
    const config: DendronSiteConfig = {
      siteIndex: "root",
      siteHierarchies: ["build-site"],
      siteRootDir: siteRootDir,
      config: {
        "build-site": {
          publishByDefault: false,
        },
      },
    };
    await new BuildSiteCommand().execute({ engine, config, dendronRoot });
    const dir = fs.readdirSync(notesDir);
    // root should exist
    let notePath = path.join(notesDir, "build-site.md");
    expect(fs.existsSync(notePath)).toBeTruthy();
    // non-root should not exist
    notePath = path.join(notesDir, "build-site.one.md");
    expect(fs.existsSync(notePath)).toBeFalsy();
    expect(dir.length).toEqual(1);
  });

  test("ids are converted", async () => {
    const config: DendronSiteConfig = {
      siteIndex: "root",
      siteHierarchies: ["build-site"],
      siteRootDir: siteRootDir,
    };
    await new BuildSiteCommand().execute({ engine, config, dendronRoot });
    let notePath = path.join(notesDir, "build-site.md");
    const { content } = readMD(notePath);
    expect(content).toMatchSnapshot("converted");
    expect(
      content.indexOf("[build-site.one](id.build-site.one)") >= 0
    ).toBeTruthy();
  });
});

describe("build-site-new", () => {
  let root: string;
  let engine: DEngine;
  let siteRootDir: string;
  let dendronRoot: string;
  let notesDir: string;

  beforeEach(async () => {
    root = EngineTestUtils.setupStoreDir();
    engine = DendronEngine.getOrCreateEngine({
      root,
      forceNew: true,
      mode: "exact",
    });
    siteRootDir = FileTestUtils.tmpDir().name;
    dendronRoot = root;
    notesDir = path.join(siteRootDir, "notes");
    await engine.init();
  });

  afterEach(() => {
    fs.removeSync(root);
  });

  test("basic", async () => {
    const config: DendronSiteConfig = {
      siteHierarchies: ["root"],
      siteRootDir,
    };
    await new BuildSiteCommand().execute({ engine, config, dendronRoot });
    const { data, content } = readMD(path.join(notesDir, "foo.md"));
    expect(data.id).toEqual("foo");
    expect(content).toMatchSnapshot("bond");
    expect(content.indexOf("- [lbl](refactor.one)") >= 0).toBe(true);
    expect(content.indexOf("SECRETS") < 0).toBe(true);
  });

  test("multiple roots", async () => {
    const config: DendronSiteConfig = {
      siteHierarchies: ["foo", "build-site"],
      siteRootDir,
    };
    await new BuildSiteCommand().execute({ engine, config, dendronRoot });
    const dir = fs.readdirSync(notesDir);
    expect(_.includes(dir, "foo.md")).toBeTruthy();
    expect(_.includes(dir, "build-site.md")).toBeTruthy();
    expect(_.includes(dir, "refactor.one.md")).toBeFalsy();
    let { data, content } = readMD(path.join(notesDir, "foo.md"));
    expect(data.nav_order).toEqual(0);
    expect(data.parent).toBe(null);
    expect(content).toMatchSnapshot("foo.md");
    ({ data, content } = readMD(path.join(notesDir, "build-site.md")));
    expect(data.nav_order).toEqual(1);
    expect(data.parent).toBe(null);
    expect(content).toMatchSnapshot("build-site.md");
    const siteRootDirContents = fs.readdirSync(siteRootDir);
    expect(_.includes(siteRootDirContents, "assets")).toBeTruthy();
  });

  test("image prefix", async () => {
    const config: DendronSiteConfig = {
      siteHierarchies: ["sample"],
      siteRootDir,
      assetsPrefix: "fake-s3.com/",
    };

    await new BuildSiteCommand().execute({ engine, config, dendronRoot });

    const { content } = readMD(path.join(notesDir, "sample.image-link.md"));
    const dir = fs.readdirSync(siteRootDir);

    expect(content).toMatchSnapshot("sample.image-link.md");

    expect(_.includes(dir, "assets")).toBeFalsy();
    expect(_.trim(content)).toEqual("![link-alt](fake-s3.com/link-path.jpg)");
  });

  test("delete unused asset", async () => {
    const config: DendronSiteConfig = {
      siteHierarchies: ["sample"],
      siteRootDir,
    };
    await new BuildSiteCommand().execute({ engine, config, dendronRoot });
    const img = path.join(siteRootDir, "assets", "images", "foo.jpg");
    expect(fs.existsSync(img)).toBeTruthy();

    // delete image, should be gone
    const imgSrc = path.join(root, "assets", "images", "foo.jpg");
    fs.unlinkSync(imgSrc);

    await new BuildSiteCommand().execute({ engine, config, dendronRoot });
    expect(fs.existsSync(img)).toBeFalsy();
  });

  test("no publsih by default", async () => {
    const config: DendronSiteConfig = {
      siteHierarchies: ["build-site"],
      siteRootDir,
      config: {
        "build-site": {
          publishByDefault: false,
        },
      },
    };
    await new BuildSiteCommand().execute({ engine, config, dendronRoot });
    const dir = fs.readdirSync(notesDir);
    // root should exist
    let notePath = path.join(notesDir, "build-site.md");
    expect(fs.existsSync(notePath)).toBeTruthy();
    // non-root should not exist
    notePath = path.join(notesDir, "build-site.one.md");
    expect(fs.existsSync(notePath)).toBeFalsy();
    expect(dir.length).toEqual(1);
  });

  test("ids are converted", async () => {
    const config: DendronSiteConfig = {
      siteHierarchies: ["build-site"],
      siteRootDir,
    };
    await new BuildSiteCommand().execute({ engine, config, dendronRoot });
    let notePath = path.join(notesDir, "build-site.md");
    const { content } = readMD(notePath);
    expect(content).toMatchSnapshot("converted");
    expect(
      content.indexOf("[build-site.one](notes/id.build-site.one)") >= 0
    ).toBeTruthy();
  });

  test("use fallback copy", async () => {
    const config: DendronSiteConfig = {
      siteHierarchies: ["sample"],
      siteRootDir,
    };
    const cmd = new BuildSiteCommand();
    cmd.copyAssets = () => {
      throw Error("bad rsync");
    };
    await cmd.execute({ engine, config, dendronRoot });
    const img = path.join(siteRootDir, "assets", "images", "foo.jpg");
    expect(fs.existsSync(img)).toBeTruthy();

    // delete image, should be gone
    // const imgSrc = path.join(root, "assets", "images", "foo.jpg");
    // fs.unlinkSync(imgSrc);

    // await new BuildSiteCommand().execute({ engine, config, dendronRoot });
    // expect(fs.existsSync(img)).toBeFalsy();
  });
});
