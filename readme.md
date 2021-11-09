This script can be used during local development or on a server to update an html template to resolve some styling issues that are known to occur across clients.

This script will do the following:

1. Consolidate header and body styles into one style element
2. Remove unused style declarations
3. Duplicate style element into the following elements:
    - the first `<head>` element
    - the second `<head>` element (will create if not existing)
    - the `<body>` element (as the first child)
4. Apply inline styles to all selected elements
5. Output prettified and updated html to source file or desired location

## Usage

Run the following to test it out using the `test.html` file:

```bash
node update.js -t test.html -o .outputs/updated-test.html
```

- `--template` or `-t` __MUST__ be used to specify the location of the html file you wish to update
- `--output` or `-o` can optionally be used to specify the output filepath for the updated html

## TLDR

After using this tool, your html should be ready for any email campaigns and hopefully look the same across clients. There are some styling concerns that should be considered and applied, some of which this tool will aim to apply automatically:

1. There should exist a second `<head>` element with the `<style>` tag duplicated into it as some clients ignore the first `head` element
2. Comments should be removed from within all `<style>` elements as some clients have a bug that causes the first rule the follows a comment to get ignored
3. The first child of the `<body>` element should be a `<style>` element to ensure all styles are declared before their rules are used
4. All elements that match the selector of a declared style should have the styles applied inline to support clients that don't support head styles
5. All media queries can only be `screen`, `min-width`, and `max-width` based as some clients don't support height based media queries
6. The first rule inside each media query should be a non-applicable with benign side-effects as some clients won't prefix the first rule. Ex: `.non-used-class: { color: black; }`
7. Media queries should __NOT__ be nested within another media query as some clients do not support nested media queries