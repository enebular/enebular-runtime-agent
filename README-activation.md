
# enebular-agent - Activation

*Read this in other languages: [English](README-enebular-activator.md), [日本語](README-enebular-activator.ja.md)*

enebular-agent supports activation with enebular.

## Usage

enebular-agent will attempt activation at the appropriate time if a valid activation configuration file exists.

## Configuration

The path of the activation configuration file defaults to `.enebular-activation-config.json`, but a different path can be specified with the `ACTIVATOR_CONFIG_PATH` environment variable.

The configuration file should contain values for `enebularBaseURL` and `licenseKey`, as the example shows below.

```
{
	"enebularBaseURL": "https://enebular.com/api/v1",
	"licenseKey": "<KEY>"
}
```
