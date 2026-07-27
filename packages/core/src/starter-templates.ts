import type { StackId } from "./stacks";

export interface StarterTemplate {
  name: string;
  packageManager: string;
  files: Readonly<Record<string, string>>;
}

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

const htmlShell = (title: string, body: string) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <style>
      :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
      body { min-height: 100vh; margin: 0; display: grid; place-items: center; background: #101010; color: #f4f4f5; }
      main { max-width: 42rem; padding: 3rem; text-align: center; }
      h1 { font-size: clamp(2.5rem, 8vw, 5rem); margin: 0 0 1rem; }
      p { color: #a1a1aa; font-size: 1.1rem; line-height: 1.7; }
    </style>
  </head>
  <body><main><h1>${title}</h1><p>${body}</p></main></body>
</html>
`;

const nodePackage = (
  name: string,
  dependencies: Record<string, string>,
  devDependencies: Record<string, string> = {},
  scripts: Record<string, string> = {},
) => json({
  name,
  version: "0.1.0",
  private: true,
  scripts,
  dependencies,
  ...(Object.keys(devDependencies).length ? { devDependencies } : {}),
});

/**
 * Built-in starters that are small enough to generate locally and complete
 * enough to pass each stack's normal build/start commands. The Template grid
 * only exposes entries in this registry; unsupported stacks remain available
 * through Git/folder import without presenting a broken starter tile.
 */
export const STARTER_TEMPLATES = {
  nextjs: {
    name: "nextjs-starter",
    packageManager: "npm",
    files: {
      "package.json": nodePackage("nextjs-starter", { next: "^16.1.6", react: "^19.2.0", "react-dom": "^19.2.0" }, {}, { dev: "next dev", build: "next build", start: "next start" }),
      "next.config.mjs": "export default {};\n",
      "app/layout.jsx": "import './globals.css';\nexport const metadata = { title: 'Next.js Starter' };\nexport default function Layout({ children }) { return <html lang=\"en\"><body>{children}</body></html>; }\n",
      "app/page.jsx": "export default function Page() { return <main><h1>Next.js Starter</h1><p>Your Openship project is ready.</p></main>; }\n",
      "app/globals.css": "html { color-scheme: dark; font-family: system-ui, sans-serif; } body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #101010; color: #fafafa; } main { text-align: center; padding: 3rem; } h1 { font-size: clamp(2.5rem, 8vw, 5rem); margin-bottom: 1rem; } p { color: #a1a1aa; }\n",
    },
  },
  nuxt: {
    name: "nuxt-starter",
    packageManager: "npm",
    files: {
      "package.json": nodePackage("nuxt-starter", { nuxt: "^4.2.2", vue: "^3.5.24" }, {}, { dev: "nuxt dev", build: "nuxt build", start: "node .output/server/index.mjs" }),
      "nuxt.config.ts": "export default defineNuxtConfig({ compatibilityDate: '2026-01-01' });\n",
      "app.vue": "<template><main><h1>Nuxt Starter</h1><p>Your Openship project is ready.</p></main></template>\n<style>html{color-scheme:dark;font-family:system-ui,sans-serif}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#101010;color:#fafafa}main{text-align:center;padding:3rem}h1{font-size:clamp(2.5rem,8vw,5rem);margin-bottom:1rem}p{color:#a1a1aa}</style>\n",
    },
  },
  sveltekit: {
    name: "sveltekit-starter",
    packageManager: "npm",
    files: {
      "package.json": nodePackage("sveltekit-starter", {}, { "@sveltejs/adapter-node": "^5.5.4", "@sveltejs/kit": "^2.49.1", svelte: "^5.43.8", vite: "^7.2.2" }, { dev: "vite dev", build: "vite build", start: "node build/index.js" }),
      "svelte.config.js": "import adapter from '@sveltejs/adapter-node';\nexport default { kit: { adapter: adapter() } };\n",
      "vite.config.js": "import { sveltekit } from '@sveltejs/kit/vite';\nimport { defineConfig } from 'vite';\nexport default defineConfig({ plugins: [sveltekit()] });\n",
      "src/routes/+page.svelte": "<svelte:head><title>SvelteKit Starter</title></svelte:head>\n<main><h1>SvelteKit Starter</h1><p>Your Openship project is ready.</p></main>\n<style>:global(html){color-scheme:dark;font-family:system-ui,sans-serif}:global(body){margin:0;min-height:100vh;display:grid;place-items:center;background:#101010;color:#fafafa}main{text-align:center;padding:3rem}h1{font-size:clamp(2.5rem,8vw,5rem);margin-bottom:1rem}p{color:#a1a1aa}</style>\n",
    },
  },
  astro: {
    name: "astro-starter",
    packageManager: "npm",
    files: {
      "package.json": nodePackage("astro-starter", { "@astrojs/node": "^9.5.0", astro: "^5.16.0" }, {}, { dev: "astro dev", build: "astro build", start: "node dist/server/entry.mjs" }),
      "astro.config.mjs": "import { defineConfig } from 'astro/config';\nimport node from '@astrojs/node';\nexport default defineConfig({ output: 'server', adapter: node({ mode: 'standalone' }) });\n",
      "src/pages/index.astro": `---\nconst title = "Astro Starter";\n---\n${htmlShell("{title}", "Your Openship project is ready.")}`,
    },
  },
  vite: {
    name: "vite-starter",
    packageManager: "npm",
    files: {
      "package.json": nodePackage("vite-starter", {}, { vite: "^7.2.2" }, { dev: "vite", build: "vite build" }),
      "vite.config.js": "import { defineConfig } from 'vite';\nexport default defineConfig({});\n",
      "index.html": htmlShell("Vite Starter", "Your Openship project is ready."),
    },
  },
  express: {
    name: "express-starter",
    packageManager: "npm",
    files: {
      "package.json": nodePackage("express-starter", { express: "^5.1.0" }, {}, { start: "node index.js" }),
      "index.js": "const express = require('express');\nconst app = express();\nconst port = Number(process.env.PORT || 3000);\napp.get('/', (_req, res) => res.type('html').send('<h1>Express Starter</h1><p>Your Openship project is ready.</p>'));\napp.listen(port, '0.0.0.0', () => console.log(`Listening on ${port}`));\n",
    },
  },
  koa: {
    name: "koa-starter",
    packageManager: "npm",
    files: {
      "package.json": nodePackage("koa-starter", { koa: "^3.0.1" }, {}, { start: "node index.js" }),
      "index.js": "const Koa = require('koa');\nconst app = new Koa();\nconst port = Number(process.env.PORT || 3000);\napp.use((ctx) => { ctx.type = 'html'; ctx.body = '<h1>Koa Starter</h1><p>Your Openship project is ready.</p>'; });\napp.listen(port, '0.0.0.0', () => console.log(`Listening on ${port}`));\n",
    },
  },
  node: {
    name: "node-starter",
    packageManager: "npm",
    files: {
      "package.json": nodePackage("node-starter", {}, {}, { start: "node index.js" }),
      "index.js": "const http = require('node:http');\nconst port = Number(process.env.PORT || 3000);\nhttp.createServer((_req, res) => { res.setHeader('content-type', 'text/html'); res.end('<h1>Node.js Starter</h1><p>Your Openship project is ready.</p>'); }).listen(port, '0.0.0.0', () => console.log(`Listening on ${port}`));\n",
    },
  },
  go: {
    name: "go-starter",
    packageManager: "go",
    files: {
      "go.mod": "module app\n\ngo 1.23\n",
      "main.go": "package main\n\nimport (\"fmt\"; \"net/http\"; \"os\")\n\nfunc main() { port := os.Getenv(\"PORT\"); if port == \"\" { port = \"8080\" }; http.HandleFunc(\"/\", func(w http.ResponseWriter, _ *http.Request) { fmt.Fprint(w, \"<h1>Go Starter</h1><p>Your Openship project is ready.</p>\") }); fmt.Println(http.ListenAndServe(\":\"+port, nil)) }\n",
    },
  },
  rust: {
    name: "rust-starter",
    packageManager: "cargo",
    files: {
      "Cargo.toml": "[package]\nname = \"app\"\nversion = \"0.1.0\"\nedition = \"2021\"\n",
      "src/main.rs": "use std::{env, io::{Read, Write}, net::TcpListener};\nfn main() { let port = env::var(\"PORT\").unwrap_or_else(|_| \"8080\".into()); let listener = TcpListener::bind(format!(\"0.0.0.0:{port}\")).unwrap(); for stream in listener.incoming() { let mut stream = stream.unwrap(); let mut buffer = [0; 1024]; let _ = stream.read(&mut buffer); let body = \"<h1>Rust Starter</h1><p>Your Openship project is ready.</p>\"; let response = format!(\"HTTP/1.1 200 OK\\r\\nContent-Type: text/html\\r\\nContent-Length: {}\\r\\nConnection: close\\r\\n\\r\\n{}\", body.len(), body); let _ = stream.write_all(response.as_bytes()); } }\n",
    },
  },
  python: {
    name: "python-starter",
    packageManager: "pip",
    files: {
      "requirements.txt": "\n",
      "app.py": "from http.server import BaseHTTPRequestHandler, HTTPServer\nimport os\n\nclass Handler(BaseHTTPRequestHandler):\n    def do_GET(self):\n        body = b'<h1>Python Starter</h1><p>Your Openship project is ready.</p>'\n        self.send_response(200)\n        self.send_header('Content-Type', 'text/html')\n        self.send_header('Content-Length', str(len(body)))\n        self.end_headers()\n        self.wfile.write(body)\n\nHTTPServer(('0.0.0.0', int(os.getenv('PORT', '8000'))), Handler).serve_forever()\n",
    },
  },
  flask: {
    name: "flask-starter",
    packageManager: "pip",
    files: {
      "requirements.txt": "Flask==3.1.2\ngunicorn==23.0.0\n",
      "app.py": "from flask import Flask\napp = Flask(__name__)\n@app.get('/')\ndef index():\n    return '<h1>Flask Starter</h1><p>Your Openship project is ready.</p>'\n",
    },
  },
  fastapi: {
    name: "fastapi-starter",
    packageManager: "pip",
    files: {
      "requirements.txt": "fastapi==0.121.2\nuvicorn[standard]==0.38.0\n",
      "main.py": "from fastapi import FastAPI\nfrom fastapi.responses import HTMLResponse\napp = FastAPI()\n@app.get('/', response_class=HTMLResponse)\ndef index():\n    return '<h1>FastAPI Starter</h1><p>Your Openship project is ready.</p>'\n",
    },
  },
  django: {
    name: "django-starter",
    packageManager: "pip",
    files: {
      "requirements.txt": "Django==5.2.8\ngunicorn==23.0.0\n",
      "manage.py": "#!/usr/bin/env python\nimport os, sys\nos.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')\nfrom django.core.management import execute_from_command_line\nexecute_from_command_line(sys.argv)\n",
      "config/__init__.py": "",
      "config/settings.py": "from pathlib import Path\nBASE_DIR = Path(__file__).resolve().parent.parent\nSECRET_KEY = 'openship-starter-change-me'\nDEBUG = False\nALLOWED_HOSTS = ['*']\nROOT_URLCONF = 'config.urls'\nMIDDLEWARE = []\nINSTALLED_APPS = ['django.contrib.staticfiles']\nSTATIC_URL = 'static/'\nSTATIC_ROOT = BASE_DIR / 'staticfiles'\nTEMPLATES = []\nDEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'\n",
      "config/urls.py": "from django.http import HttpResponse\nfrom django.urls import path\ndef index(_request): return HttpResponse('<h1>Django Starter</h1><p>Your Openship project is ready.</p>')\nurlpatterns = [path('', index)]\n",
      "config/wsgi.py": "import os\nos.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')\nfrom django.core.wsgi import get_wsgi_application\napplication = get_wsgi_application()\n",
    },
  },
  sinatra: {
    name: "sinatra-starter",
    packageManager: "bundler",
    files: {
      "Gemfile": "source 'https://rubygems.org'\ngem 'sinatra', '~> 4.1'\ngem 'puma', '~> 6.6'\n",
      "app.rb": "require 'sinatra'\nset :bind, '0.0.0.0'\nset :port, ENV.fetch('PORT', '4567')\nget('/') { '<h1>Sinatra Starter</h1><p>Your Openship project is ready.</p>' }\n",
    },
  },
  springboot: {
    name: "springboot-starter",
    packageManager: "maven",
    files: {
      "pom.xml": "<project xmlns=\"http://maven.apache.org/POM/4.0.0\" xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\" xsi:schemaLocation=\"http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd\"><modelVersion>4.0.0</modelVersion><parent><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-parent</artifactId><version>3.5.7</version></parent><groupId>dev.openship</groupId><artifactId>app</artifactId><version>0.1.0</version><properties><java.version>21</java.version></properties><dependencies><dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-web</artifactId></dependency></dependencies><build><plugins><plugin><groupId>org.springframework.boot</groupId><artifactId>spring-boot-maven-plugin</artifactId></plugin></plugins></build></project>\n",
      "src/main/java/dev/openship/App.java": "package dev.openship;\nimport org.springframework.boot.SpringApplication;\nimport org.springframework.boot.autoconfigure.SpringBootApplication;\nimport org.springframework.web.bind.annotation.GetMapping;\nimport org.springframework.web.bind.annotation.RestController;\n@SpringBootApplication @RestController public class App { public static void main(String[] args) { SpringApplication.run(App.class, args); } @GetMapping(\"/\") public String index() { return \"<h1>Spring Boot Starter</h1><p>Your Openship project is ready.</p>\"; } }\n",
      "src/main/resources/application.properties": "server.address=0.0.0.0\nserver.port=${PORT:8080}\n",
    },
  },
  dotnet: {
    name: "dotnet-starter",
    packageManager: "dotnet",
    files: {
      "app.csproj": "<Project Sdk=\"Microsoft.NET.Sdk.Web\"><PropertyGroup><TargetFramework>net8.0</TargetFramework><Nullable>enable</Nullable><ImplicitUsings>enable</ImplicitUsings><AssemblyName>app</AssemblyName></PropertyGroup></Project>\n",
      "Program.cs": "var builder = WebApplication.CreateBuilder(args);\nvar app = builder.Build();\napp.MapGet(\"/\", () => Results.Content(\"<h1>.NET Starter</h1><p>Your Openship project is ready.</p>\", \"text/html\"));\napp.Run();\n",
    },
  },
} satisfies Partial<Record<StackId, StarterTemplate>>;

export type StarterTemplateId = keyof typeof STARTER_TEMPLATES;

export function hasStarterTemplate(stackId: string): stackId is StarterTemplateId {
  return Object.prototype.hasOwnProperty.call(STARTER_TEMPLATES, stackId);
}

