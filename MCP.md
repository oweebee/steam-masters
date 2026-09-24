# MCP Postgres Steam Masters

Endpoint public documenté : `https://steammasters-mcp.obsidianspoon.com/sse`.
Le service est actuellement en transport SSE ; ne pas remplacer l'URL par `/mcp`
tant que l'image `crystaldba/postgres-mcp` n'expose pas le transport Streamable HTTP.

## Accès depuis Claude Code

Le fichier `.mcp.json` du dépôt configure le serveur distant sans enregistrer de
secret. Claude Code récent essaie le transport HTTP puis retombe sur SSE. Il faut
Claude Code 2.1.265 ou plus récent pour ce repli automatique.

Dans PowerShell, créer la variable utilisateur en saisissant le mot de passe au
prompt (il ne sera ni affiché ni écrit dans le dépôt) :

```powershell
$credential = Get-Credential -UserName 'mcp' -Message 'Mot de passe MCP Steam Masters'
$pair = "mcp:$($credential.GetNetworkCredential().Password)"
$encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($pair))
[Environment]::SetEnvironmentVariable('STEAMMASTERS_MCP_BASIC_AUTH', $encoded, 'User')
```

Fermer puis relancer Claude Code, ouvrir le projet et vérifier avec `/mcp` ou
`claude mcp list`. Pour un Claude Code trop ancien pour le repli HTTP vers SSE,
mettre à jour Claude Code; sinon, l'ajout direct doit transmettre le même header
Basic (`--transport sse` et `--header "Authorization: Basic <base64>"`).

## Erreur 401

`401 Unauthorized` vient de l'authentification Basic de Traefik, avant la
connexion PostgreSQL. Vérifier le mot de passe auprès de l'instance configurée et
redéployer le fichier Compose actuel dans Coolify. Le label peut être remplacé
sans modifier le code en définissant `MCP_BASIC_AUTH_USERS` dans Coolify au
format `utilisateur:empreinte-htpasswd`. Générer l'empreinte avec `htpasswd -nB
mcp` (la commande demande le mot de passe sans l'afficher), puis copier
uniquement la sortie dans la variable Coolify. Ne jamais mettre le mot de passe
en clair dans un label, dans `.mcp.json` ou dans Git.

Le MCP Postgres reste en accès `unrestricted` pour la base de développement :
ne pas le réutiliser tel quel pour une base de production.
