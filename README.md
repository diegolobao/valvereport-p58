# ValveReport

Aplicação web (Vite + React + TypeScript) para gerar relatório de atuação de válvulas on-off.

- Select de Tag (lista em `public/limites.csv`, coluna `TagBusca`)
- Período (Data Início / Data Fim)
- Status ("Todos", "Normal", "Falha")
- Upload de CSV para busca

## Executar

```cmd
npm install
npm run dev
```

Abra http://localhost:5173.

Coloque seu arquivo CSV no componente de upload e clique em Buscar.

## Estrutura
- `public/limites.csv` — fonte de tags
- `src/ui/App.tsx` — UI principal

Sinta-se à vontade para adaptar a lógica de leitura do CSV carregado (PapaParse) conforme o modelo do seu arquivo.