# 🏎️ F1 Data Pipeline

Este projeto é um pipeline de dados simples para coletar, transformar e carregar dados de voltas de corrida da Fórmula 1 usando Airflow, dbt e PostgreSQL. Ele demonstra uma arquitetura de dados em camadas (`raw`, `staging`, `marts`) para garantir a organização e a qualidade dos dados.

-----

### **Visão Geral da Arquitetura**

O pipeline utiliza a seguinte arquitetura:

  * **Fonte de Dados**: A biblioteca Python `FastF1` é usada para extrair dados brutos de voltas de corrida da F1.
  * **Ingestão de Dados**: Apache Airflow gerencia a orquestração do pipeline, executando a ingestão dos dados para o banco de dados.
  * **Armazenamento de Dados**: PostgreSQL armazena os dados em diferentes esquemas, representando cada etapa da transformação.
  * **Transformação de Dados**: dbt (Data Build Tool) é usado para transformar os dados brutos em modelos prontos para análise, seguindo a arquitetura em camadas (`raw`, `staging`, `marts`).
  * **Orquestração**: Apache Airflow é responsável por agendar e executar as tarefas de ingestão e transformação.

-----

### **Estrutura do Projeto**

```
f1-data-pipeline/
├── dags/
│   ├── fastf1_load.py              # Definição do pipeline do Airflow
├── f1_transform/                   # Projeto dbt para transformação dos dados
│   ├── dbt_project.yml
│   ├── profiles.yml
│   ├── models/
│   │   ├── staging/
│   │   │   └── stg_laps.sql        # Limpeza e preparação dos dados
│   │   └── marts/
│   │       └── agg_laps.sql        # Modelo final para análise
│   ├── macros/
│   │   └── schema_macros.sql       # Macro para controle dos esquemas
├── docker-compose.yml              # Configuração dos serviços (Airflow, Postgres)
├── Dockerfile.airflow              # Define o ambiente do Airflow
└── README.md
```

-----

### **Como Usar**

#### **1. Pré-requisitos**

Certifique-se de ter o Docker e o Docker Compose instalados em sua máquina.

#### **2. Configuração do Ambiente**

Clone este repositório e navegue até a pasta do projeto.

```bash
git clone <URL_DO_SEU_REPOSITORIO>
cd f1-data-pipeline
```

#### **3. Execução dos Serviços**

Inicie os contêineres do Docker:

```bash
docker-compose up --build
```

O contêiner do Airflow iniciará, e você poderá acessar a UI do Airflow em `http://localhost:8080`. Use as credenciais `admin` para o usuário e senha.

#### **4. Verificação**

No Airflow, a DAG chamada `f1_pipeline` deve estar visível e pronta para ser executada. Dispare a DAG manualmente para iniciar o pipeline.

Ao concluir, você pode verificar os esquemas e tabelas no seu banco de dados PostgreSQL usando uma ferramenta como o DBeaver. Você verá as seguintes tabelas criadas:

  * `raw.fastf1_laps`
  * `staging.stg_laps`
  * `marts.agg_laps`

-----

### **Detalhes Técnicos**

#### **Arquivos de Configuração**

  * **`docker-compose.yml`**: Configura os serviços `postgres` e `airflow`, montando os diretórios do projeto para que o Airflow possa acessá-los.
  * **`f1_transform/dbt_project.yml`**: Define o projeto dbt, as camadas (`staging`, `marts`) e o materializado das tabelas.
  * **`f1_transform/profiles.yml`**: Armazena as credenciais de conexão com o banco de dados. É um arquivo de configuração sensível.
  * **`f1_transform/macros/schema_macros.sql`**: Contém uma macro personalizada que garante que os esquemas (`staging`, `marts`) sejam criados sem o prefixo padrão do dbt, evitando problemas de concatenação.

#### **DAG `fastf1_load.py`**

A DAG é dividida em três tarefas principais:

1.  **`create_schemas`**: Cria os esquemas `raw`, `staging` e `marts` no PostgreSQL antes de qualquer operação.
2.  **`ingest_data`**: Coleta os dados de uma corrida da F1 e os carrega para a tabela `raw.fastf1_laps`.
3.  **`transform_data`**: Uma tarefa do Cosmos que executa o projeto dbt, transformando os dados de `raw` para `staging` e depois para `marts`.