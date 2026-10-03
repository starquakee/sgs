import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { localFilesPlugin } from "../../scripts/sgs/local-files.mjs";

const port = {
	client: 8081,
	server: 8089,
};

export default defineConfig({
	appType: "mpa",
	root: ".",
	base: "./",
	resolve: {
		alias: {
			"@": "/noname",
			noname: "/noname.js",
		},
	},
	plugins: [localFilesPlugin(import.meta.dirname), vue()],
	optimizeDeps: {
		exclude: ["electron", "@electron/remote"],
	},
	server: {
		host: "127.0.0.1",
		port: port.client,
		fs: {
			allow: ["../.."],
		},
		proxy: {
			"/checkFile": "http://127.0.0.1:" + port.server,
			"/checkDir": "http://127.0.0.1:" + port.server,
			"/readFile": "http://127.0.0.1:" + port.server,
			"/readFileAsText": "http://127.0.0.1:" + port.server,
			"/writeFile": "http://127.0.0.1:" + port.server,
			"/removeFile": "http://127.0.0.1:" + port.server,
			"/getFileList": "http://127.0.0.1:" + port.server,
			"/createDir": "http://127.0.0.1:" + port.server,
			"/removeDir": "http://127.0.0.1:" + port.server,
		},
	},
});
