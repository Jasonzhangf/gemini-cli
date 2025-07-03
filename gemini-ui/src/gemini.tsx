import { AppWrapper } from "./components/AppWrapper";
import { getConfig } from "./config";
import { OpenAICompatibleContentGenerator } from "./services/OpenAICompatibleContentGenerator";

async function main() {
  const config = await getConfig();

  // VIRTUAL TOOL INJECTION
  const generator = config.getGenerator();
  if (generator instanceof OpenAICompatibleContentGenerator) {
    const virtualTools = await generator.getAllAvailableTools();
    const toolRegistry = config.getToolRegistry();
    toolRegistry.registerTools(virtualTools);
  }

  const root = createRoot(document.getElementById("root")!);
  root.render(
    <AppWrapper config={config} />
  );
}

main(); 