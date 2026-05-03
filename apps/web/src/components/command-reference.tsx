import { Badge } from "#/components/ui/badge";
import { commandCategories } from "#/data/commands";

export function CommandReference() {
  return (
    <section id="commands" className="lp-section">
      <div className="mb-12">
        <p className="lp-label mb-2">Reference</p>
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Command Reference</h2>
        <p className="text-muted-foreground mt-2 max-w-xl">
          All Parley slash commands, organized by category. Use these in your Discord server.
        </p>
      </div>

      <div className="space-y-8">
        {commandCategories.map((category) => (
          <div key={category.title}>
            <h3 className="text-xl font-semibold mb-1">{category.title}</h3>
            <p className="text-muted-foreground text-sm mb-4">{category.description}</p>

            <div className="space-y-3">
              {category.commands.map((command) => (
                <div key={command.name} className="lp-card p-4">
                  <div className="flex items-start gap-3">
                    <code className="font-mono text-sm bg-secondary px-2 py-1 rounded-none whitespace-nowrap">
                      /{command.name}
                    </code>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">{command.description}</p>
                      {command.subcommands && command.subcommands.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {command.subcommands.map((sub) => (
                            <Badge key={sub.name} variant="outline" className="text-xs font-mono">
                              {sub.name}
                            </Badge>
                          ))}
                        </div>
                      )}
                      {command.options && command.options.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {command.options.map((opt) => (
                            <Badge key={opt.name} variant="secondary" className="text-xs font-mono">
                              {opt.name}
                              {opt.required ? "*" : ""}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
