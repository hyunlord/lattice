import type { Edge, NodeDraft } from "../core/model.js";
import type { CodeModule } from "./code.js";

/** Package membership is evidence of declaration, never evidence of file usage. */
export function packageNode(language: string, name: string, members: readonly CodeModule[]): NodeDraft {
    const sources = members.flatMap(member => member.node.sources.map(source => ({ ...source, pointer: `/packages/${name.replaceAll("~", "~0").replaceAll("/", "~1")}` })));
    return {
        id: `package:${language}:${name}`, kind: "package", name,
        attributes: {
            language, packageName: name,
            directories: [...new Set(sources.map(source => source.path.split("/").slice(0, -1).join("/") || "."))].sort(),
            memberIds: members.map(member => member.node.id).sort(),
        },
        sources,
    };
}

export function packageMembership(node: NodeDraft): readonly Edge[] {
    const members = node.attributes["memberIds"];
    if (!Array.isArray(members)) return [];
    return members.flatMap(target => typeof target === "string" ? [{
        id: `package-member:${node.id}:${target}`, kind: "contains", source: node.id, target,
        directed: true, field: "package", sources: node.sources.filter(source => `module:${source.path}` === target),
    }] : []);
}
