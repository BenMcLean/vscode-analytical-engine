const esbuild = require("esbuild");
const path = require("path");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
	name: "esbuild-problem-matcher",

	setup(build) {
		build.onStart(() => {
			console.log("[watch] build started");
		});
		build.onEnd((result) => {
			result.errors.forEach(({ text, location }) => {
				console.error(`x [ERROR] ${text}`);
				if (location) {
					console.error(
						`    ${location.file}:${location.line}:${location.column}:`,
					);
				}
			});
			console.log("[watch] build finished");
		});
	},
};

async function createContext(platform, outfile) {
	return esbuild.context({
		absWorkingDir: __dirname,
		entryPoints: [path.join(__dirname, "src", "extension.ts")],
		bundle: true,
		format: "cjs",
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		tsconfig: path.join(__dirname, "tsconfig.json"),
		platform,
		outfile: path.join(__dirname, outfile),
		external: ["vscode"],
		logLevel: "silent",
		plugins: [esbuildProblemMatcherPlugin],
	});
}

async function main() {
	const contexts = await Promise.all([
		createContext("node", "dist/node/extension.js"),
		createContext("browser", "dist/web/extension.js"),
	]);

	if (watch) {
		await Promise.all(contexts.map((context) => context.watch()));
	} else {
		await Promise.all(contexts.map((context) => context.rebuild()));
		await Promise.all(contexts.map((context) => context.dispose()));
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
