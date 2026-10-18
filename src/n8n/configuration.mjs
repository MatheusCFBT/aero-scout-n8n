export function execute({ input }, { commands }) {
  return input.all().flatMap(({ json }) => {
    const result = commands.parse(json);
    return result ? [{ json: result }] : [];
  });
}

export const dependencies = { commands: "commands" };
