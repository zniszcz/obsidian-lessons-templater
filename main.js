"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => MocPrevNextPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var DEFAULT_SETTINGS = {
  templatePath: "",
  mocField: "course",
  prevField: "previous",
  nextField: "next",
  tocHeader: "Table of Contents"
};
var MocPrevNextPlugin = class extends import_obsidian.Plugin {
  async onload() {
    await this.loadSettings();
    this.addSettingTab(new MocPrevNextSettingTab(this.app, this));
    this.addCommand({
      id: "fill-prev-next",
      name: "Fill previous/next from MoC",
      callback: () => this.fillPrevNext()
    });
    this.addCommand({
      id: "insert-template-and-fill",
      name: "Insert template and fill previous/next",
      callback: () => this.insertTemplateAndFill()
    });
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  async insertTemplateAndFill() {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      new import_obsidian.Notice("No active file.");
      return;
    }
    if (!this.settings.templatePath) {
      new import_obsidian.Notice("No template configured. Set it in plugin settings.");
      return;
    }
    const templateFile = this.app.vault.getAbstractFileByPath(this.settings.templatePath);
    if (!templateFile || !(templateFile instanceof import_obsidian.TFile)) {
      new import_obsidian.Notice(`Template not found: ${this.settings.templatePath}`);
      return;
    }
    const templateContent = await this.app.vault.read(templateFile);
    await this.app.vault.modify(activeFile, templateContent);
    await new Promise((resolve) => setTimeout(resolve, 200));
    await this.fillPrevNext();
  }
  async fillPrevNext() {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      new import_obsidian.Notice("No active file.");
      return;
    }
    const frontmatter = this.app.metadataCache.getFileCache(activeFile)?.frontmatter;
    const mocFieldName = this.settings.mocField;
    if (!frontmatter?.[mocFieldName]) {
      new import_obsidian.Notice(`No "${mocFieldName}" field in frontmatter.`);
      return;
    }
    const mocName = this.extractLinkName(frontmatter[mocFieldName]);
    if (!mocName) {
      new import_obsidian.Notice(`Could not parse ${mocFieldName} link.`);
      return;
    }
    const mocFile = this.app.metadataCache.getFirstLinkpathDest(
      mocName,
      activeFile.path
    );
    if (!mocFile) {
      new import_obsidian.Notice(`MoC "${mocName}" not found.`);
      return;
    }
    const mocContent = await this.app.vault.read(mocFile);
    const links = this.extractLinksFromToc(mocContent);
    if (links.length === 0) {
      new import_obsidian.Notice("No links found in MoC table of contents.");
      return;
    }
    const currentName = activeFile.basename;
    const currentIndex = links.findIndex((link) => link === currentName);
    if (currentIndex === -1) {
      new import_obsidian.Notice(`"${currentName}" not found in MoC.`);
      return;
    }
    const prev = currentIndex > 0 ? `[[${links[currentIndex - 1]}]]` : "";
    const next = currentIndex < links.length - 1 ? `[[${links[currentIndex + 1]}]]` : "";
    await this.updateFrontmatter(activeFile, prev, next);
    new import_obsidian.Notice(`Updated: prev=${prev || "(none)"}, next=${next || "(none)"}`);
  }
  extractLinkName(value) {
    const match = value.match(/\[\[([^\]|]+)/);
    return match ? match[1] : null;
  }
  extractLinksFromToc(content) {
    const lines = content.split("\n");
    let inToc = false;
    const links = [];
    const escapedHeader = this.settings.tocHeader.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const tocPattern = new RegExp(`^\\s*\\*\\s*#\\s*${escapedHeader}`, "i");
    for (const line of lines) {
      if (!inToc) {
        if (tocPattern.test(line)) {
          inToc = true;
        }
        continue;
      }
      const linkMatches = line.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g);
      for (const m of linkMatches) {
        if (!links.includes(m[1])) {
          links.push(m[1]);
        }
      }
    }
    return links;
  }
  async updateFrontmatter(file, prev, next) {
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      fm[this.settings.prevField] = prev;
      fm[this.settings.nextField] = next;
    });
  }
};
var MocPrevNextSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    const coreTemplates = this.app.internalPlugins?.plugins?.templates;
    const templateFolder = coreTemplates?.instance?.options?.folder || "";
    const files = this.app.vault.getMarkdownFiles().filter((f) => templateFolder && f.path.startsWith(templateFolder)).sort((a, b) => a.path.localeCompare(b.path));
    new import_obsidian.Setting(containerEl).setName("Template").setDesc(`Showing templates from: ${templateFolder || "(no template folder configured in Obsidian)"}`).addDropdown((dropdown) => {
      dropdown.addOption("", "\u2014 select \u2014");
      for (const file of files) {
        dropdown.addOption(file.path, file.basename);
      }
      dropdown.setValue(this.plugin.settings.templatePath).onChange(async (value) => {
        this.plugin.settings.templatePath = value;
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian.Setting(containerEl).setName("MoC field").setDesc("Frontmatter field that links to the Map of Content note").addText(
      (text) => text.setPlaceholder("course").setValue(this.plugin.settings.mocField).onChange(async (value) => {
        this.plugin.settings.mocField = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Previous field").setDesc("Frontmatter field for the previous lesson link").addText(
      (text) => text.setPlaceholder("previous").setValue(this.plugin.settings.prevField).onChange(async (value) => {
        this.plugin.settings.prevField = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Next field").setDesc("Frontmatter field for the next lesson link").addText(
      (text) => text.setPlaceholder("next").setValue(this.plugin.settings.nextField).onChange(async (value) => {
        this.plugin.settings.nextField = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("ToC header").setDesc("Heading text in the MoC note that marks the start of the table of contents").addText(
      (text) => text.setPlaceholder("Table of Contents").setValue(this.plugin.settings.tocHeader).onChange(async (value) => {
        this.plugin.settings.tocHeader = value;
        await this.plugin.saveSettings();
      })
    );
  }
};
