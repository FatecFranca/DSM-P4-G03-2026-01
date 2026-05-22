# ProtectHer

Projeto Interdisciplinar do 4º semestre DSM - 2026/1

## Grupo
- Ana Laura Lis
- Gustavo Daniel
- Larissa Coutinho
- Carlos Costa

---

## Sobre o Projeto

ProtectHer é uma aplicação mobile para segurança pessoal com alertas em tempo real e localização.

---

## Como Rodar o Projeto

### Pré-requisitos

Antes de começar, certifique-se de ter instalado:

| Ferramenta | Versão | Como instalar |
|------------|--------|---------------|
| **Node.js** | 18+ | https://nodejs.org |
| **pnpm** | 9.15+ | npm install -g pnpm |
| **PostgreSQL** | 14+ | https://postgresql.org |

### 1. Instalar Dependências

```bash
corepack pnpm install
```

### 2. Configurar Banco de Dados

#### Criar o banco:
```bash
createdb -U postgres protecther
```

#### Configurar variáveis de ambiente:
```bash
cp apps/api/.env.example apps/api/.env
```

Edite o arquivo `apps/api/.env` com suas credenciais do PostgreSQL:
```env
DATABASE_URL=postgresql://postgres:senha@localhost:5432/protecther
JWT_SECRET=seu-secret-aqui-minimo-16-caracteres
JWT_EXPIRES_SECONDS=604800
NODE_ENV=development
PORT=3000
```

### 3. Executar Migrações

```bash
# Gerar arquivos de migração
corepack pnpm --filter protecther-api db:generate

# Aplicar migrações no banco
corepack pnpm --filter protecther-api db:migrate
```

### 4. Executar o Projeto

#### Modo Desenvolvimento (API + Mobile juntos):
```bash
corepack pnpm dev
```

#### Apenas API:
```bash
corepack pnpm dev:api
```

#### Apenas Mobile:
```bash
corepack pnpm dev:mobile
```

---

## Configuração do App Mobile

### Variáveis de Ambiente Mobile

```bash
cp apps/mobile/.env.example apps/mobile/.env
```

**Importante para dispositivos físicos/emuladores:**

- **Android Emulator:** Use http://10.0.2.2:3000
- **Dispositivo físico:** Use o IP da sua máquina na rede (ex: http://192.168.1.100:3000)

---

## Outros Comandos Úteis

```bash
# Compilar o projeto
corepack pnpm build

# Executar lint
corepack pnpm lint

# Formatar código
corepack pnpm format

# Verificar tipos TypeScript
corepack pnpm typecheck

# Rodar seed (dados iniciais de teste)
corepack pnpm --filter protecther-api db:seed
```

---

## Estrutura do Projeto

```
protecther/
├── apps/
│   ├── api/          # Backend (Fastify)
│   └── mobile/       # App Mobile (React Native + Expo)
├── packages/
│   ├── contracts/    # Tipos compartilhados
│   └── shared/       # Código compartilhado
└── package.json      # Configurações do monorepo
```

---

## Dúvidas Frequentes

**Erro de conexão com o banco?**
- Verifique se o PostgreSQL está rodando
- Confirme a senha e porta no .env

**App mobile não conecta na API?**
- Use o IP correto para seu dispositivo/emulador
- Verifique se a API está rodando na porta 3000