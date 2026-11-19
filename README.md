# Train Horn Sound Level

Estimate how loud a horn (or any compact sound source) is at a distance, right inside VS Code.
It uses the free-field inverse-square law: a horn rated **150 dB at 10 ft** is about **130.0 dB at 100 ft**.

By [Train Horn](https://train-horn.com/), an independent reference on train horns. The math is the same as the
open-source [trainhorn-calc](https://github.com/train-horn/trainhorn-calc) Python package, and the results are checked against it in the tests.

## Features

### Command: Train Horn: Sound level at distance

Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and run **Train Horn: Sound level at distance**. Three input boxes ask for:

1. the level in dB (for example `150`);
2. the reference distance the rating applies to (`10 ft`, `1 m`, `3m`);
3. the distance you care about (`100 ft`, `30 m`).

The result appears as a notification, for example
`150.0 dB at 10 ft → 130.0 dB at 100 ft (−20.0 dB)`, with **Copy** and **Open web calculator** buttons.
Feet and metres can be mixed; a number with no unit uses the `trainhorn.defaultUnit` setting.

### Command: Train Horn: Distance for target level

The inverse: at what distance does a 150 dB @ 10 ft horn fall to 85 dB? (About 17,800 ft, ignoring air absorption and terrain.)

### Hover tables

Hover any rating written like `150 dB @ 10 ft`, `149dB at 3 m` or `118 dBA at 1 meter` in any file
(product notes, spec sheets, Markdown, code comments) to see the estimated level at common distances:

| Distance | Level |
|---:|---:|
| 10 ft | 150.0 dB |
| 100 ft | 130.0 dB |
| 1000 ft | 110.0 dB |

## The model

```
L(d) = L_ref − 20 · log10(d / d_ref)
```

* About 6.02 dB lower for every doubling of distance, 20 dB lower for every tenfold increase.
* Two equal horns together are about 3 dB louder than one, not twice the decibels.
* Point source in a free field: ground reflections, buildings, wind, temperature gradients and barriers are ignored, so real outdoor levels can differ by several dB.
* Very close to the horn (within a horn length or two) the law does not hold.

Results are **estimates, not measurements**, and not a legal noise assessment. Manufacturer dB ratings are claims made by the manufacturer.

## Settings

| Setting | Default | Description |
|---|---|---|
| `trainhorn.defaultUnit` | `ft` | Unit used for numbers typed without `ft` or `m`. |
| `trainhorn.hover.enabled` | `true` | Show the hover table on ratings such as `150 dB @ 10 ft`. |

## Development

```bash
npm ci
npm test                  # mocha unit tests for the math, parsing and commands (mocked VS Code API)
npm run test:integration  # smoke test in a real VS Code extension host (@vscode/test-electron)
npx @vscode/vsce package --no-dependencies
```

The extension has no runtime dependencies and collects no data.

## Related

* Web version with charts: [Decibels at distance calculator](https://train-horn.com/tools/decibel-distance/)
* Python package: [trainhorn-calc](https://github.com/train-horn/trainhorn-calc)

## License

[MIT](LICENSE) © 2026 Train Horn
