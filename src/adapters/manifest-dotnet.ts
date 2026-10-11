import { msbuildResolver } from "./manifest-msbuild.js";
import type { SourceInput } from "./types.js";
import { basePackage, jsonObject, strings, string, joinPath, sourceLine, diagnostic } from "./manifest-types.js";
import type { BuildManifestDiagnostic, ManifestPackage } from "./manifest-types.js";
function xmlValue(text: string, tag: string): string { return new RegExp(`<${tag}\\b[^>]*>([^<]*)<\\/${tag}>`, "u").exec(text)?.[1]?.trim() ?? ""; }
export function dotnetPackages(inputs: readonly SourceInput[], diagnostics: BuildManifestDiagnostic[]): ManifestPackage[] {
    const references = msbuildResolver(inputs, diagnostics);
    const packages: ManifestPackage[] = [], guids = new Map<string, string>();
    for (const input of inputs.filter(input => input.path.endsWith(".asmdef.meta"))) { const guid = /^guid:\s*(\w+)/mu.exec(input.text)?.[1]; if (guid) guids.set(guid, input.path.slice(0, -5)); }
    for (const input of inputs) {
        if (/\.(?:csproj|fsproj|vbproj|vcxproj|ilproj|proj)$/u.test(input.path)) {
            const text = input.text.replace(/<!--[\s\S]*?-->/gu, value => value.replace(/[^\n]/gu, " "));
            const pkg = basePackage(input, "dotnet", xmlValue(text, "AssemblyName") || input.path.split("/").at(-1)?.replace(/\.[^.]+$/u, "") || "");
            pkg.description = xmlValue(text, "Description") || xmlValue(text, "PackageDescription");
            pkg.importNames = [xmlValue(text, "RootNamespace") || pkg.name];
            pkg.dependencies.push(...references(input));
            packages.push(pkg);
        } else if (input.path.endsWith(".asmdef")) {
            const data = jsonObject(input, diagnostics); if (!data) continue;
            const pkg = basePackage(input, "unity", string(data['name'])); pkg.importNames = [string(data['rootNamespace']) || pkg.name];
            pkg.isTestAssembly = strings(data['optionalUnityReferences']).includes("TestAssemblies") || strings(data['references']).some(reference => /^(?:UnityEngine|UnityEditor)\.TestRunner$/u.test(reference));
            for (const reference of strings(data['references'])) {
                const path = reference.startsWith("GUID:") ? guids.get(reference.slice(5)) : undefined;
                if (reference.startsWith("GUID:") && !path) { diagnostic(input, diagnostics, "unresolved-package", "Assembly GUID is not present in selected metadata"); continue; }
                pkg.dependencies.push({ name: reference, ...(path ? { path } : {}), scope: "assembly", line: sourceLine(input, Math.max(0, input.text.indexOf(JSON.stringify(reference)))) });
            }
            packages.push(pkg);
        }
    }
    return packages;
}
export function mavenPackages(inputs: readonly SourceInput[], diagnostics: BuildManifestDiagnostic[]): ManifestPackage[] {
    const packages: ManifestPackage[] = [];
    for (const input of inputs.filter(input => input.path.endsWith("pom.xml"))) {
        const text = input.text.replace(/<!--[\s\S]*?-->/gu, value => value.replace(/[^\n]/gu, " "));
        const root = text.replace(/<(?:parent|dependencies|dependencyManagement|build|profiles|reporting)\b[^>]*>[\s\S]*?<\/(?:parent|dependencies|dependencyManagement|build|profiles|reporting)>/gu, "");
        const pkg = basePackage(input, "maven", xmlValue(root, "artifactId")); const group = xmlValue(root, "groupId") || xmlValue(/<parent\b[^>]*>([\s\S]*?)<\/parent>/u.exec(text)?.[1] ?? "", "groupId");
        pkg.aliases = group ? [`${group}:${pkg.name}`] : []; pkg.description = xmlValue(root, "description");
        pkg.sourceRoots = [joinPath(pkg.root, "src/main") ?? pkg.root];
        const declarations = text.replace(/<(dependencyManagement|build|profiles|reporting)\b[^>]*>[\s\S]*?<\/\1>/gu, value => value.replace(/[^\n]/gu, " "));
        for (const match of declarations.matchAll(/<dependency\b[^>]*>([\s\S]*?)<\/dependency>/gu)) {
            const body = match[1] ?? "", target = xmlValue(body, "artifactId"), targetGroup = xmlValue(body, "groupId");
            if (/\$\{/u.test(target + targetGroup)) { diagnostic(input, diagnostics, "dynamic-manifest", "Maven property dependency needs effective POM evaluation", sourceLine(input, match.index ?? 0)); continue; }
            if (target) pkg.dependencies.push({ name: targetGroup ? `${targetGroup}:${target}` : target, scope: xmlValue(body, "scope") || "compile", line: sourceLine(input, match.index ?? 0) });
        }
        packages.push(pkg);
    }
    return packages;
}
