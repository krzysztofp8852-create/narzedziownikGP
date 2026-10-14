import Link from "next/link";
import type { Inline, MarkdownBlock } from "@/markdown/parse";

function Text({ content }: { content: Inline[] }) {
  return content.map((part, index) =>
    part.href ? (
      <Link key={index} href={part.href}>
        {part.text}
      </Link>
    ) : part.strong ? (
      <strong key={index}>{part.text}</strong>
    ) : (
      part.text
    ),
  );
}

function Block({ block }: { block: MarkdownBlock }) {
  switch (block.kind) {
    case "heading": {
      const Heading = block.level === 2 ? "h2" : "h3";
      return <Heading id={block.id}>{block.text}</Heading>;
    }
    case "paragraph":
      return (
        <p>
          <Text content={block.content} />
        </p>
      );
    case "list": {
      const items = block.items.map((item, index) => (
        <li key={index}>
          <Text content={item.content} />
          {item.children.length > 0 && (
            <ul>
              {item.children.map((child, childIndex) => (
                <li key={childIndex}>
                  <Text content={child} />
                </li>
              ))}
            </ul>
          )}
        </li>
      ));
      return block.ordered ? <ol start={block.start}>{items}</ol> : <ul>{items}</ul>;
    }
  }
}

/** Treść pliku Markdown (`parseMarkdown`): nagłówki z kotwicami, akapity, listy, odnośniki i wytłuszczenia. */
export function MarkdownBlocks({ blocks }: { blocks: MarkdownBlock[] }) {
  return blocks.map((block, index) => <Block key={index} block={block} />);
}
