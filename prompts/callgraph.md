I am building a Repository Map. Extract the Call Graph from the provided codebase.

For every file, list the functions. For EACH function, include a -> Calls: vector listing any other internal services, providers, or controllers it relies on.

Use this EXACT format:

📁 apps/api/src/controllers/auth.controller.ts
* login(req, res)
    * Logic: Authenticates user credentials.
    * -> Calls: auth.provider.login, api.service.getOne

Do not list standard library calls (console.log, map, etc).
ONLY list calls to other functions or files within this codebase.
If a function calls nothing external, write -> Calls: None.

Output the result under the header: # Call Graph
