
const express = require('express');
const sqlite3 = require('sqlite3').verbose();

const app = express();
app.use(express.json()); // avisa pro express que vamos usar JSON

const db = new sqlite3.Database('./biblioteca.db', (erro) => {
  if (erro) {
    console.error("Deu ruim ao abrir o banco: ", erro.message);
  } else {
    console.log("Conectou no SQLite de boa!");
    
    // db.serialize garante que o banco vai criar uma tabela por vez pra não embolar
    db.serialize(() => {
      // 1. Tabela de Livros
      db.run(`
        create table if not exists livros (
          id integer primary key autoincrement,
          nome text not null, 
          autores text not null,
          data_publicacao text not null, 
          qtd_paginas integer not null,
          num_edicao integer not null,
          categoria text not null check(categoria in ('ACADEMICO', 'INFANTIL', 'LITERATURA', 'AUTOBIOGRAFIA')),
          status text not null check(status in ('DISPONIVEL', 'INDISPONIVEL'))
        );
      `);

      // 2. Tabela de Usuarios
      db.run(`
        create table if not exists usuarios (
          id integer primary key autoincrement,
          nome text not null,
          cpf text unique not null,
          telefone text not null,
          email text unique not null
        );
      `);

      // 3. Tabela de Emprestimos
      db.run(`
        create table if not exists emprestimos (
          id integer primary key autoincrement,
          id_livro integer not null,
          id_usuario integer not null,
          data_emprestimo text not null,
          data_vencimento text not null,
          status text not null check(status in ('ATIVO', 'ATRASADO', 'CONCLUIDO')),
          foreign key (id_livro) references livros(id),
          foreign key (id_usuario) references usuarios(id)
        );
      `);
      
      console.log("Todas as tabelas prontas pra uso!");
    });
  }
});

// ==========================================
// ROTAS DE LIVROS (2.1)
// ==========================================

// ==========================================
// ROTA PARA CADASTRAR UM NOVO LIVRO (POST)
// ==========================================
app.post('/livros', (req, res) => {
  // Extrai os dados enviados no corpo da requisição (Body)
  const { nome, autores, data_publicacao, qtd_paginas, num_edicao, categoria, status } = req.body;
  
  // Validação: Verifica se o usuário esqueceu de mandar algum campo
  if (!nome || !autores || !data_publicacao || !qtd_paginas || !num_edicao || !categoria || !status) {
    return res.status(400).json({ erro: "Preenche todos os campos do livro aí!" });
  }
  
  // Comando SQL usando '?' para prevenir ataques de SQL Injection
  const sqlInsert = `insert into livros (nome, autores, data_publicacao, qtd_paginas, num_edicao, categoria, status) values (?, ?, ?, ?, ?, ?, ?)`;
  
  // db.run executa o comando e substitui as '?' pelos dados reais da array
  db.run(sqlInsert, [nome, autores, data_publicacao, qtd_paginas, num_edicao, categoria, status], function(erro) {
    if (erro) return res.status(500).json({ erro: "Erro ao salvar livro." });
    res.status(201).json({ mensagem: "Livro cadastrado!", id: this.lastID }); // lastID pega o ID gerado pelo banco
  });
});

// ==========================================
// ROTA PARA LISTAR TODOS OS LIVROS (GET)
// ==========================================
app.get('/livros', (req, res) => {
  // Realiza a consulta para buscar todos os registros da tabela 'livros'
  db.all('select * from livros', [], (erro, linhas) => {
    if (erro) return res.status(500).json({ erro: "Deu ruim pra buscar livros." });
    res.status(200).json(linhas); // Retorna a lista em formato JSON
  });
});

// ==========================================
// ROTA PARA BUSCAR LIVRO POR NOME (GET)
// ==========================================
app.get('/livros/busca', (req, res) => {
  // Captura o parâmetro de busca passado na URL (Query Params. Ex: ?nome=Senhor)
  const termo = req.query.nome;
  if (!termo) return res.status(400).json({ erro: "Manda um nome na URL!" });
  
  // Usa o operador LIKE e as porcentagens (%) para buscar palavras aproximadas
  db.all('select * from livros where nome like ?', [`%${termo}%`], (erro, linhas) => {
    if (erro) return res.status(500).json({ erro: "Erro na pesquisa." });
    res.status(200).json(linhas);
  });
});

// ==========================================
// ROTA PARA CALCULAR QUANTIDADE DE CÓPIAS (GET)
// ==========================================
app.get('/livros/copias', (req, res) => {
  // Usa os comandos nativos do banco (COUNT e GROUP BY) para agrupar as edições repetidas
  const sql = `select nome, num_edicao, count(*) as quantidade_copias from livros group by nome, num_edicao`;
  db.all(sql, [], (erro, linhas) => {
    if (erro) return res.status(500).json({ erro: "Erro ao calcular copias." });
    res.status(200).json(linhas);
  });
});

// ==========================================
// ROTA PARA ATUALIZAR UM LIVRO INTEIRO (PUT)
// ==========================================
app.put('/livros/:id', (req, res) => {
  const { nome, autores, data_publicacao, qtd_paginas, num_edicao, categoria, status } = req.body;
  if (!nome || !autores || !data_publicacao || !qtd_paginas || !num_edicao || !categoria || !status) {
    return res.status(400).json({ erro: "Manda todos os campos pra atualizar." });
  }
  
  // Comando de atualização. O último '?' será o ID capturado da URL
  const sqlUpdate = `update livros set nome = ?, autores = ?, data_publicacao = ?, qtd_paginas = ?, num_edicao = ?, categoria = ?, status = ? where id = ?`;
  
  // req.params.id pega o número que o usuário digitou no final do link
  db.run(sqlUpdate, [nome, autores, data_publicacao, qtd_paginas, num_edicao, categoria, status, req.params.id], function(erro) {
    if (erro) return res.status(500).json({ erro: "Erro no update." });
    // Se this.changes for 0, significa que nenhum dado foi alterado (o ID não existe)
    if (this.changes === 0) return res.status(404).json({ erro: "ID nao encontrado." });
    res.status(200).json({ mensagem: "Livro atualizado!" });
  });
});

// ==========================================
// ROTA PARA APAGAR UM LIVRO (DELETE)
// ==========================================
app.delete('/livros/:id', (req, res) => {
  // Deleta o registro filtrando pelo ID recebido na URL de forma segura
  db.run('delete from livros where id = ?', [req.params.id], function(erro) {
    if (erro) return res.status(500).json({ erro: "Erro ao deletar." });
    if (this.changes === 0) return res.status(404).json({ erro: "Livro nao achado." });
    res.status(200).json({ mensagem: "Livro apagado." });
  });
});

// ==========================================
// ROTAS DE USUÁRIOS (2.2)
// ==========================================

// ==========================================
// ROTA PARA CADASTRAR UM NOVO USUÁRIO (POST)
// ==========================================
app.post('/usuarios', (req, res) => {
  // Extrai os dados enviados no corpo da requisição (Body JSON)
  const { nome, cpf, telefone, email } = req.body;
  
  // Validação: Garante que o cliente enviou todos os dados necessários
  if (!nome || !cpf || !telefone || !email) return res.status(400).json({ erro: "Preencha tudo do usuario!" });
  
  // Insere no banco utilizando as interrogações '?' para evitar ataques de SQL Injection
  db.run('insert into usuarios (nome, cpf, telefone, email) values (?, ?, ?, ?)', [nome, cpf, telefone, email], function(erro) {
    if (erro) {
      // Captura o erro específico do SQLite caso o CPF ou E-mail já existam (restrição UNIQUE da tabela)
      if (erro.message.includes("UNIQUE")) return res.status(400).json({ erro: "CPF ou E-mail ja cadastrado!" });
      return res.status(500).json({ erro: "Erro ao salvar usuario." });
    }
    // Retorna status 201 (Criado) e o ID gerado automaticamente pelo banco para o novo usuário
    res.status(201).json({ mensagem: "Usuario salvo!", id: this.lastID });
  });
});

// ==========================================
// ROTA PARA BUSCAR UM USUÁRIO POR CPF (GET)
// ==========================================
app.get('/usuarios/:cpf', (req, res) => {
  // db.get é usado aqui em vez de db.all porque queremos apenas UM registro (o CPF é único)
  // req.params.cpf captura o número do CPF que foi digitado direto na URL
  db.get('select * from usuarios where cpf = ?', [req.params.cpf], (erro, usuario) => {
    if (erro) return res.status(500).json({ erro: "Problema na busca." });
    
    // Se a consulta rodou mas a variável 'usuario' veio vazia, significa que ele não existe (Erro 404)
    if (!usuario) return res.status(404).json({ erro: "Nenhum usuario com esse CPF." });
    
    // Se deu tudo certo, retorna os dados do usuário encontrado com status 200 (OK)
    res.status(200).json(usuario);
  });
});

// ==========================================
// ROTA PARA APAGAR UM USUÁRIO (DELETE)
// ==========================================
app.delete('/usuarios/:id', (req, res) => {
  // Executa o comando de exclusão passando o ID capturado da URL (req.params.id) de forma segura
  db.run('delete from usuarios where id = ?', [req.params.id], function(erro) {
    if (erro) return res.status(500).json({ erro: "Erro ao excluir." });
    
    // this.changes verifica quantas linhas foram afetadas no banco. Se for 0, o ID não existe lá
    if (this.changes === 0) return res.status(404).json({ erro: "Usuario nao encontrado." });
    
    // Retorna mensagem confirmando a exclusão
    res.status(200).json({ mensagem: "Usuario apagado." });
  });
});

// ==========================================
// ROTAS DE EMPRÉSTIMOS (2.3)
// ==========================================

// ==========================================
// ROTA PARA CADASTRAR UM NOVO EMPRÉSTIMO (POST)
// ==========================================
app.post('/emprestimos', (req, res) => {
  // Recebe os IDs (para criar o relacionamento entre tabelas) e as datas
  const { id_livro, id_usuario, data_emprestimo, data_vencimento, status } = req.body;
  
  // Validação: Não deixa registrar o empréstimo se faltar alguma informação
  if (!id_livro || !id_usuario || !data_emprestimo || !data_vencimento || !status) {
    return res.status(400).json({ erro: "Preencha todos os campos do emprestimo." });
  }
  
  // Comando SQL de inserção protegido contra Injeção de SQL
  const sql = `insert into emprestimos (id_livro, id_usuario, data_emprestimo, data_vencimento, status) values (?, ?, ?, ?, ?)`;
  
  // Executa o comando substituindo as interrogações pelos dados recebidos
  db.run(sql, [id_livro, id_usuario, data_emprestimo, data_vencimento, status], function(erro) {
    if (erro) return res.status(500).json({ erro: "Erro ao salvar emprestimo." });
    
    // Retorna status 201 (Created) confirmando que a transação foi registrada
    res.status(201).json({ mensagem: "Emprestimo registrado!", id: this.lastID });
  });
});

// ==========================================
// ROTA PARA LISTAR TODOS OS EMPRÉSTIMOS (GET)
// ==========================================
app.get('/emprestimos', (req, res) => {
  // O 'order by id desc' garante que os empréstimos mais recentes (IDs maiores) apareçam no topo da lista
  db.all('select * from emprestimos order by id desc', [], (erro, linhas) => {
    if (erro) return res.status(500).json({ erro: "Erro na listagem." });
    res.status(200).json(linhas);
  });
});

// ==========================================
// ROTA PARA LISTAR EMPRÉSTIMOS DE UM USUÁRIO (GET)
// ==========================================
app.get('/emprestimos/usuario/:id_usuario', (req, res) => {
  // Filtra a tabela de empréstimos usando a chave estrangeira (id_usuario) passada na URL
  db.all('select * from emprestimos where id_usuario = ?', [req.params.id_usuario], (erro, linhas) => {
    if (erro) return res.status(500).json({ erro: "Erro ao buscar." });
    res.status(200).json(linhas); // Retorna todo o histórico daquele usuário específico
  });
});

// ==========================================
// ROTA PARA LISTAR EMPRÉSTIMOS POR STATUS (GET)
// ==========================================
app.get('/emprestimos/status/:status', (req, res) => {
  // O .toUpperCase() transforma o que o cliente digitou na URL tudo em maiúsculo (ex: "atrasado" vira "ATRASADO").
  // Isso evita erros de busca no banco de dados.
  db.all('select * from emprestimos where status = ?', [req.params.status.toUpperCase()], (erro, linhas) => {
    if (erro) return res.status(500).json({ erro: "Erro ao filtrar." });
    res.status(200).json(linhas);
  });
});

// ==========================================
// ROTA PARA ATUALIZAR UM EMPRÉSTIMO (PUT)
// ==========================================
app.put('/emprestimos/:id', (req, res) => {
  // Usado geralmente para mudar o status (ex: de "EMPRESTADO" para "DEVOLVIDO")
  const { id_livro, id_usuario, data_emprestimo, data_vencimento, status } = req.body;
  
  if (!id_livro || !id_usuario || !data_emprestimo || !data_vencimento || !status) {
    return res.status(400).json({ erro: "Manda todos os dados pra atualizar." });
  }
  
  // Atualiza todos os campos, garantindo que a alteração seja feita apenas na linha do ID correto
  const sql = `update emprestimos set id_livro = ?, id_usuario = ?, data_emprestimo = ?, data_vencimento = ?, status = ? where id = ?`;
  
  db.run(sql, [id_livro, id_usuario, data_emprestimo, data_vencimento, status, req.params.id], function(erro) {
    if (erro) return res.status(500).json({ erro: "Erro no update." });
    
    // Se changes for igual a 0, significa que o ID do empréstimo informado na URL não existe
    if (this.changes === 0) return res.status(404).json({ erro: "Emprestimo nao encontrado." });
    
    res.status(200).json({ mensagem: "Emprestimo atualizado!" });
  });
});

// ==========================================
// INICIALIZAÇÃO DO SERVIDOR
// ==========================================
const PORTA = 3000;
app.listen(PORTA, () => {
  console.log(`Servidor no ar rodando na porta ${PORTA}...`);
});