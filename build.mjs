import "dotenv/config";
import esbuild from "esbuild";

await esbuild.build({
	entryPoints: ["main.ts"],
	bundle: true,
	external: ["obsidian"],
	outfile: "main.js",
	format: "cjs",
	platform: "node",
	define: {
		"process.env.DEBUG_LOG_TO_FILE": JSON.stringify(process.env.DEBUG_LOG_TO_FILE || "false"),
	},
});
