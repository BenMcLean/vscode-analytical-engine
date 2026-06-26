const fs = require("fs");
const path = require("path");

// The extension bundle in dist/ already contains the emulator's JavaScript,
// but VSIX packaging would either omit the built-in Library cards entirely or
// include the whole analytical-engine package tree. Copying just Library/*
// keeps the shipped extension small while preserving runtime support for
// "A include from library cards ..." in desktop and web hosts.
const sourceDir = path.join(
	__dirname,
	"..",
	"node_modules",
	"analytical-engine",
	"Library",
);
const targetDir = path.join(
	__dirname,
	"..",
	"dist",
	"analytical-engine",
	"Library",
);

fs.mkdirSync(targetDir, { recursive: true });
fs.cpSync(sourceDir, targetDir, { recursive: true, force: true });
