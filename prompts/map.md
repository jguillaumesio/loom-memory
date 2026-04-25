I want to create a Repository Map for my documentation. Read the attached codebase.

Generate a Markdown document formatted exactly like a file tree.
For every file, list the functions or methods it contains.
Next to each function name, write a strictly one-sentence description of its core logic based on the code.

Use this exact format:

📁 src/auth.js
- loginUser(email, password): Validates credentials against the database and returns a JWT token.
- logoutUser(session): Destroys the active user session.

Do not explain the code, do not output code blocks. Just generate the map.
Output the result under the header: # Code Map
