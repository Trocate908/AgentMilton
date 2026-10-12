---
name: OpenAPI client DOM types
description: TypeScript DOM library requirement for generated API clients in this workspace.
---

Keep `DOM.Iterable` enabled in the React API client TypeScript libraries when regenerating OpenAPI clients.

**Why:** Generated fetch client code calls iterable `Headers` methods such as `entries()`, which fail typechecking without the DOM iterable declarations.

**How to apply:** Preserve the DOM iterable library when updating `lib/api-client-react/tsconfig.json` or changing API code generation.
