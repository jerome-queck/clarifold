module.exports = {
  packagerConfig: {
    asar: { unpackDir: "dist/helpers" },
    icon: undefined,
    osxSign: {
      identity: "-",
      identityValidation: false,
      optionsForFile: () => ({ hardenedRuntime: false }),
      continueOnError: false
    },
    extraResource: ["dist/verifiers"],
    ignore: [
      /^\/src($|\/)/,
      /^\/tests($|\/)/,
      /^\/docs($|\/)/,
      /^\/native($|\/)/,
      /^\/scripts($|\/)/,
      /^\/dist\/verifiers($|\/)/,
      /^\/prototype($|\/)/,
      /^\/.agents($|\/)/,
      /^\/.claude($|\/)/,
      /^\/.github($|\/)/,
      /^\/out($|\/)/
    ]
  },
  makers: []
};
