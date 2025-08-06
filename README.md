
# 🏎️ F1 Analytics Pipeline com Airflow, FastF1, Postgres e dbt

Este projeto implementa um pipeline de dados para coletar, armazenar e transformar dados da Fórmula 1 utilizando:

- [Apache Airflow](https://airflow.apache.org/) como orquestrador
- [FastF1](https://theoehrly.github.io/Fast-F1/) para ingestão dos dados
- [PostgreSQL](https://www.postgresql.org/) como data warehouse
- [dbt](https://www.getdbt.com/) para transformações analíticas

---

## 📁 Estrutura do Projeto

```bash
.
├── dags/                    # DAGs do Airflow
│   ├── fastf1_load.py       # DAG principal para ingestão FastF1
│   └── load_fastf1.py       # Script de ingestão com FastF1
├── cache/                   # Cache local usado pelo FastF1
├── dbt/                     # Diretório de modelos dbt
├── scripts/                 # Scripts auxiliares, se necessário
├── Dockerfile.airflow       # Dockerfile customizado para Airflow
├── docker-compose.yml       # Configuração de todos os serviços
├── profiles.yml             # Perfil do dbt para conexão com o Postgres
└── README.md                # Este arquivo
```

---

## 🚀 Como Executar Localmente

### 1. Pré-requisitos

- Docker e Docker Compose instalados
- Porta `8080` (Airflow) e `5432` (Postgres) disponíveis

### 2. Clonar o repositório

```bash
git clone https://github.com/seu-usuario/seu-repo.git
cd seu-repo
```

### 3. Criar as pastas necessárias

```bash
mkdir -p ./cache ./scripts
```

> 🔒 A pasta `./cache` é usada pelo FastF1 como diretório de cache e precisa ter permissão de escrita.

### 4. Subir os containers

```bash
docker-compose up -d --build
```

### 5. Acessar o Airflow

Abra [http://localhost:8080](http://localhost:8080) no navegador.

- **Usuário**: `admin`
- **Senha**: `admin`

---

## 🛠️ DAG Principal

- **Nome**: `fastf1_to_postgres`
- **Função**: coleta dados da Fórmula 1 via `FastF1` e insere no banco Postgres

---

## 🧠 Transformações com dbt

O serviço `dbt` roda os modelos a partir do diretório `./dbt`, com configuração em `profiles.yml`.

Para executar os modelos manualmente:

```bash
docker-compose run --rm dbt run
```

---

## ⚙️ Configurações Técnicas

### docker-compose.yml

Inclui os seguintes serviços:

- **Postgres**: base de dados para armazenamento
- **Airflow**: orquestrador das DAGs
- **dbt**: ferramenta para transformação de dados

Volumes montados:

```yaml
volumes:
  - ./dags:/opt/airflow/dags
  - ./cache:/opt/airflow/cache
  - ./scripts:/opt/airflow/dags
```

### Airflow Cache com FastF1

O script `load_fastf1.py` ativa o cache no caminho:

```python
fastf1.Cache.enable_cache("/opt/airflow/cache")
```

---

## 🧪 Testes

Você pode rodar a DAG manualmente na interface do Airflow ou configurar uma agenda para execuções automáticas.

---

## 🧹 Dicas de Debug

- Se a DAG não aparecer: verifique a extensão `.py` dos arquivos dentro de `dags/` e reinicie o Airflow.
- Se der erro de cache: verifique permissões da pasta `./cache` e se ela foi criada corretamente.

---

## 📌 Roadmap Futuro

- Armazenamento histórico por temporada
- Criação de materializações dbt (`incremental` e `view`)
- Conexão com ferramentas de BI (ex: Metabase ou Superset)

---

## 📝 Licença

Este projeto está sob a licença MIT.

---

## 👨‍💻 Autor

Guilherme Tavares  
[LinkedIn](https://www.linkedin.com/in/seu-perfil) • [GitHub](https://github.com/seu-usuario)
