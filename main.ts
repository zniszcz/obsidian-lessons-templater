import { App, Plugin, Notice, TFile, PluginSettingTab, Setting } from "obsidian";

interface MocPrevNextSettings {
	templatePath: string;
	mocField: string;
	prevField: string;
	nextField: string;
	tocHeader: string;
}

const DEFAULT_SETTINGS: MocPrevNextSettings = {
	templatePath: "",
	mocField: "course",
	prevField: "previous",
	nextField: "next",
	tocHeader: "Table of Contents",
};

export default class MocPrevNextPlugin extends Plugin {
	settings!: MocPrevNextSettings;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new MocPrevNextSettingTab(this.app, this));

		this.addCommand({
			id: "fill-prev-next",
			name: "Fill previous/next from MoC",
			callback: () => this.fillPrevNext(),
		});

		this.addCommand({
			id: "insert-template-and-fill",
			name: "Insert template and fill previous/next",
			callback: () => this.insertTemplateAndFill(),
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
			new Notice("No active file.");
			return;
		}

		if (!this.settings.templatePath) {
			new Notice("No template configured. Set it in plugin settings.");
			return;
		}

		const templateFile = this.app.vault.getAbstractFileByPath(this.settings.templatePath);
		if (!templateFile || !(templateFile instanceof TFile)) {
			new Notice(`Template not found: ${this.settings.templatePath}`);
			return;
		}

		const templateContent = await this.app.vault.read(templateFile);
		await this.app.vault.modify(activeFile, templateContent);

		// Let metadataCache update after modifying the file
		await new Promise((resolve) => setTimeout(resolve, 200));

		await this.fillPrevNext();
	}

	async fillPrevNext() {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice("No active file.");
			return;
		}

		const frontmatter =
			this.app.metadataCache.getFileCache(activeFile)?.frontmatter;
		const mocFieldName = this.settings.mocField;
		if (!frontmatter?.[mocFieldName]) {
			new Notice(`No "${mocFieldName}" field in frontmatter.`);
			return;
		}

		const mocName = this.extractLinkName(frontmatter[mocFieldName]);
		if (!mocName) {
			new Notice(`Could not parse ${mocFieldName} link.`);
			return;
		}

		const mocFile = this.app.metadataCache.getFirstLinkpathDest(
			mocName,
			activeFile.path,
		);
		if (!mocFile) {
			new Notice(`MoC "${mocName}" not found.`);
			return;
		}

		const mocContent = await this.app.vault.read(mocFile);
		const links = this.extractLinksFromToc(mocContent);

		if (links.length === 0) {
			new Notice("No links found in MoC table of contents.");
			return;
		}

		const currentName = activeFile.basename;
		const currentIndex = links.findIndex((link) => link === currentName);

		if (currentIndex === -1) {
			new Notice(`"${currentName}" not found in MoC.`);
			return;
		}

		const prev =
			currentIndex > 0 ? `[[${links[currentIndex - 1]}]]` : "";
		const next =
			currentIndex < links.length - 1
				? `[[${links[currentIndex + 1]}]]`
				: "";

		await this.updateFrontmatter(activeFile, prev, next);
		new Notice(`Updated: prev=${prev || "(none)"}, next=${next || "(none)"}`);
	}

	extractLinkName(value: string): string | null {
		const match = value.match(/\[\[([^\]|]+)/);
		return match ? match[1] : null;
	}

	extractLinksFromToc(content: string): string[] {
		const lines = content.split("\n");

		let inToc = false;
		const links: string[] = [];
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

	async updateFrontmatter(file: TFile, prev: string, next: string) {
		await this.app.fileManager.processFrontMatter(file, (fm) => {
			fm[this.settings.prevField] = prev;
			fm[this.settings.nextField] = next;
		});
	}
}

class MocPrevNextSettingTab extends PluginSettingTab {
	plugin: MocPrevNextPlugin;

	constructor(app: App, plugin: MocPrevNextPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display() {
		const { containerEl } = this;
		containerEl.empty();

		const coreTemplates = (this.app as any).internalPlugins?.plugins?.templates;
		const templateFolder: string = coreTemplates?.instance?.options?.folder || "";
		const files = this.app.vault
			.getMarkdownFiles()
			.filter((f) => templateFolder && f.path.startsWith(templateFolder))
			.sort((a, b) => a.path.localeCompare(b.path));

		new Setting(containerEl)
			.setName("Template")
			.setDesc(`Showing templates from: ${templateFolder || "(no template folder configured in Obsidian)"}`)
			.addDropdown((dropdown) => {
				dropdown.addOption("", "— select —");
				for (const file of files) {
					dropdown.addOption(file.path, file.basename);
				}
				dropdown
					.setValue(this.plugin.settings.templatePath)
					.onChange(async (value) => {
						this.plugin.settings.templatePath = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("MoC field")
			.setDesc("Frontmatter field that links to the Map of Content note")
			.addText((text) =>
				text
					.setPlaceholder("course")
					.setValue(this.plugin.settings.mocField)
					.onChange(async (value) => {
						this.plugin.settings.mocField = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Previous field")
			.setDesc("Frontmatter field for the previous lesson link")
			.addText((text) =>
				text
					.setPlaceholder("previous")
					.setValue(this.plugin.settings.prevField)
					.onChange(async (value) => {
						this.plugin.settings.prevField = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Next field")
			.setDesc("Frontmatter field for the next lesson link")
			.addText((text) =>
				text
					.setPlaceholder("next")
					.setValue(this.plugin.settings.nextField)
					.onChange(async (value) => {
						this.plugin.settings.nextField = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("ToC header")
			.setDesc("Heading text in the MoC note that marks the start of the table of contents")
			.addText((text) =>
				text
					.setPlaceholder("Table of Contents")
					.setValue(this.plugin.settings.tocHeader)
					.onChange(async (value) => {
						this.plugin.settings.tocHeader = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
