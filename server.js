// importando os pacotes que a gente instalou no terminal
const express = require('express');
const sqlite3 = require('sqlite3').verbose();

// iniciando o app
const app = express();
app.use(express.json()); // avisa pro express que vamos usar JSON

// conectando com o banco de dados
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

app.post('/livros', (req, res) => {
  const { nome, autores, data_publicacao, qtd_paginas, num_edicao, categoria, status } = req.body;
  if (!nome || !autores || !data_publicacao || !qtd_paginas || !num_edicao || !categoria || !status) {
    return res.status(400).json({ erro: "Preenche todos os campos do livro aí!" });
  }
  const sqlInsert = `insert into livros (nome, autores, data_publicacao, qtd_paginas, num_edicao, categoria, status) values (?, ?, ?, ?, ?, ?, ?)`;
  db.run(sqlInsert, [nome, autores, data_publicacao, qtd_paginas, num_edicao, categoria, status], function(erro) {
    if (erro) return res.status(500).json({ erro: "Erro ao salvar livro." });
    res.status(201).json({ mensagem: "Livro cadastrado!", id: this.lastID });
  });
});

app.get('/livros', (req, res) => {
  db.all('select * from livros', [], (erro, linhas) => {
    if (erro) return res.status(500).json({ erro: "Deu ruim pra buscar livros." });
    res.status(200).json(linhas);
  });
});

app.get('/livros/busca', (req, res) => {
  const termo = req.query.nome;
  if (!termo) return res.status(400).json({ erro: "Manda um nome na URL!" });
  db.all('select * from livros where nome like ?', [`%${termo}%`], (erro, linhas) => {
    if (erro) return res.status(500).json({ erro: "Erro na pesquisa." });
    res.status(200).json(linhas);
  });
});

app.get('/livros/copias', (req, res) => {
  const sql = `select nome, num_edicao, count(*) as quantidade_copias from livros group by nome, num_edicao`;
  db.all(sql, [], (erro, linhas) => {
    if (erro) return res.status(500).json({ erro: "Erro ao calcular copias." });
    res.status(200).json(linhas);
  });
});

app.put('/livros/:id', (req, res) => {
  const { nome, autores, data_publicacao, qtd_paginas, num_edicao, categoria, status } = req.body;
  if (!nome || !autores || !data_publicacao || !qtd_paginas || !num_edicao || !categoria || !status) {
    return res.status(400).json({ erro: "Manda todos os campos pra atualizar." });
  }
  const sqlUpdate = `update livros set nome = ?, autores = ?, data_publicacao = ?, qtd_paginas = ?, num_edicao = ?, categoria = ?, status = ? where id = ?`;
  db.run(sqlUpdate, [nome, autores, data_publicacao, qtd_paginas, num_edicao, categoria, status, req.params.id], function(erro) {
    if (erro) return res.status(500).json({ erro: "Erro no update." });
    if (this.changes === 0) return res.status(404).json({ erro: "ID nao encontrado." });
    res.status(200).json({ mensagem: "Livro atualizado!" });
  });
});

app.delete('/livros/:id', (req, res) => {
  db.run('delete from livros where id = ?', [req.params.id], function(erro) {
    if (erro) return res.status(500).json({ erro: "Erro ao deletar." });
    if (this.changes === 0) return res.status(404).json({ erro: "Livro nao achado." });
    res.status(200).json({ mensagem: "Livro apagado." });
  });
});

// ==========================================
// ROTAS DE USUÁRIOS (2.2)
// ==========================================

app.post('/usuarios', (req, res) => {
  const { nome, cpf, telefone, email } = req.body;
  if (!nome || !cpf || !telefone || !email) return res.status(400).json({ erro: "Preencha tudo do usuario!" });
  db.run('insert into usuarios (nome, cpf, telefone, email) values (?, ?, ?, ?)', [nome, cpf, telefone, email], function(erro) {
    if (erro) {
      if (erro.message.includes("UNIQUE")) return res.status(400).json({ erro: "CPF ou E-mail ja cadastrado!" });
      return res.status(500).json({ erro: "Erro ao salvar usuario." });
    }
    res.status(201).json({ mensagem: "Usuario salvo!", id: this.lastID });
  });
});

app.get('/usuarios/:cpf', (req, res) => {
  db.get('select * from usuarios where cpf = ?', [req.params.cpf], (erro, usuario) => {
    if (erro) return res.status(500).json({ erro: "Problema na busca." });
    if (!usuario) return res.status(404).json({ erro: "Nenhum usuario com esse CPF." });
    res.status(200).json(usuario);
  });
});

app.delete('/usuarios/:id', (req, res) => {
  db.run('delete from usuarios where id = ?', [req.params.id], function(erro) {
    if (erro) return res.status(500).json({ erro: "Erro ao excluir." });
    if (this.changes === 0) return res.status(404).json({ erro: "Usuario nao encontrado." });
    res.status(200).json({ mensagem: "Usuario apagado." });
  });
});

// ==========================================
// ROTAS DE EMPRÉSTIMOS (2.3)
// ==========================================

app.post('/emprestimos', (req, res) => {
  const { id_livro, id_usuario, data_emprestimo, data_vencimento, status } = req.body;
  if (!id_livro || !id_usuario || !data_emprestimo || !data_vencimento || !status) {
    return res.status(400).json({ erro: "Preencha todos os campos do emprestimo." });
  }
  const sql = `insert into emprestimos (id_livro, id_usuario, data_emprestimo, data_vencimento, status) values (?, ?, ?, ?, ?)`;
  db.run(sql, [id_livro, id_usuario, data_emprestimo, data_vencimento, status], function(erro) {
    if (erro) return res.status(500).json({ erro: "Erro ao salvar emprestimo." });
    res.status(201).json({ mensagem: "Emprestimo registrado!", id: this.lastID });
  });
});

app.get('/emprestimos', (req, res) => {
  db.all('select * from emprestimos order by id desc', [], (erro, linhas) => {
    if (erro) return res.status(500).json({ erro: "Erro na listagem." });
    res.status(200).json(linhas);
  });
});

app.get('/emprestimos/usuario/:id_usuario', (req, res) => {
  db.all('select * from emprestimos where id_usuario = ?', [req.params.id_usuario], (erro, linhas) => {
    if (erro) return res.status(500).json({ erro: "Erro ao buscar." });
    res.status(200).json(linhas);
  });
});

app.get('/emprestimos/status/:status', (req, res) => {
  db.all('select * from emprestimos where status = ?', [req.params.status.toUpperCase()], (erro, linhas) => {
    if (erro) return res.status(500).json({ erro: "Erro ao filtrar." });
    res.status(200).json(linhas);
  });
});

app.put('/emprestimos/:id', (req, res) => {
  const { id_livro, id_usuario, data_emprestimo, data_vencimento, status } = req.body;
  if (!id_livro || !id_usuario || !data_emprestimo || !data_vencimento || !status) {
    return res.status(400).json({ erro: "Manda todos os dados pra atualizar." });
  }
  const sql = `update emprestimos set id_livro = ?, id_usuario = ?, data_emprestimo = ?, data_vencimento = ?, status = ? where id = ?`;
  db.run(sql, [id_livro, id_usuario, data_emprestimo, data_vencimento, status, req.params.id], function(erro) {
    if (erro) return res.status(500).json({ erro: "Erro no update." });
    if (this.changes === 0) return res.status(404).json({ erro: "Emprestimo nao encontrado." });
    res.status(200).json({ mensagem: "Emprestimo atualizado!" });
  });
});

// ==========================================


const PORTA = 3000;
app.listen(PORTA, () => {
  console.log(`Servidor no ar rodando na porta ${PORTA}...`);
});