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

const LOG_FILE = "moc-prev-next-debug.log";
const LOG_TO_FILE = process.env.DEBUG_LOG_TO_FILE === "true";

export default class MocPrevNextPlugin extends Plugin {
	settings!: MocPrevNextSettings;
	private logLines: string[] = [];

	private log(...parts: unknown[]) {
		const msg = parts.map(p => typeof p === "string" ? p : JSON.stringify(p)).join(" ");
		console.log(msg);
		if (LOG_TO_FILE) {
			this.logLines.push(`${new Date().toISOString()} ${msg}`);
		}
	}

	private async flushLog() {
		if (!LOG_TO_FILE || this.logLines.length === 0) return;
		const content = this.logLines.join("\n") + "\n";
		this.logLines = [];
		const existing = this.app.vault.getAbstractFileByPath(LOG_FILE);
		if (existing instanceof TFile) {
			const prev = await this.app.vault.read(existing);
			await this.app.vault.modify(existing, prev + content);
		} else {
			await this.app.vault.create(LOG_FILE, content);
		}
	}

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

		this.log("[MoC] Active file:", activeFile.path);
		this.log("[MoC] Settings:", JSON.stringify(this.settings));

		const frontmatter =
			this.app.metadataCache.getFileCache(activeFile)?.frontmatter;
		this.log("[MoC] Frontmatter:", JSON.stringify(frontmatter));
		const mocFieldName = this.settings.mocField;
		if (!frontmatter?.[mocFieldName]) {
			this.log(`[MoC] Field "${mocFieldName}" not found in frontmatter`);
			new Notice(`No "${mocFieldName}" field in frontmatter.`);
			await this.flushLog();
			return;
		}

		const mocFieldValue = frontmatter[mocFieldName];
		this.log(`[MoC] Field "${mocFieldName}" value:`, mocFieldValue);
		const mocName = this.extractLinkName(mocFieldValue);
		this.log("[MoC] Extracted link name:", mocName);
		if (!mocName) {
			new Notice(`Could not parse ${mocFieldName} link.`);
			await this.flushLog();
			return;
		}

		const mocFile = this.app.metadataCache.getFirstLinkpathDest(
			mocName,
			activeFile.path,
		);
		this.log("[MoC] Resolved MoC file:", mocFile?.path ?? "null");
		if (!mocFile) {
			new Notice(`MoC "${mocName}" not found.`);
			await this.flushLog();
			return;
		}

		const mocContent = await this.app.vault.read(mocFile);
		this.log("[MoC] MoC content length:", mocContent.length);
		const links = this.extractLinksFromToc(mocContent);
		this.log("[MoC] Links found in ToC:", links);

		if (links.length === 0) {
			new Notice("No links found in MoC table of contents.");
			await this.flushLog();
			return;
		}

		const currentName = activeFile.basename;
		const currentIndex = links.findIndex((link) => link === currentName);
		this.log(`[MoC] Looking for "${currentName}" in links, index: ${currentIndex}`);

		if (currentIndex === -1) {
			new Notice(`"${currentName}" not found in MoC.`);
			await this.flushLog();
			return;
		}

		const prev =
			currentIndex > 0 ? `[[${links[currentIndex - 1]}]]` : "";
		const next =
			currentIndex < links.length - 1
				? `[[${links[currentIndex + 1]}]]`
				: "";

		this.log(`[MoC] Result: prev=${prev || "(none)"}, next=${next || "(none)"}`);
		await this.updateFrontmatter(activeFile, prev, next);
		new Notice(`Updated: prev=${prev || "(none)"}, next=${next || "(none)"}`);
		await this.flushLog();
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
		this.log("[MoC] ToC pattern:", tocPattern.source);

		for (const line of lines) {
			if (!inToc) {
				if (tocPattern.test(line)) {
					this.log("[MoC] ToC header matched on line:", line);
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
			.setDesc("Text of the heading that starts the table of contents (e.g. \"Spis treści\", without the \"* #\" prefix)")
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
