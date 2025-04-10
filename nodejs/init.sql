-- 创建数据库
CREATE DATABASE knowledge_base;

-- -- 创建用户表
-- CREATE TABLE IF NOT EXISTS users (
--     user_id VARCHAR(22) PRIMARY KEY,
--     username VARCHAR(32) UNIQUE NOT NULL,
--     email VARCHAR(128) UNIQUE,
--     nickname VARCHAR(32),
--     password VARCHAR(128) NOT NULL,
--     roles JSONB NOT NULL DEFAULT '[]'::JSONB,
--     api_keys JSONB,
--     created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
--     updated_at TIMESTAMP,
--     deleted_at TIMESTAMP
-- );

-- -- 创建用户角色表 (对应UserRole实体)
-- CREATE TABLE IF NOT EXISTS user_roles (
--     user_role_id VARCHAR(22) PRIMARY KEY,
--     user_id VARCHAR(22) REFERENCES users(user_id),
--     target_id VARCHAR(22) NOT NULL,
--     role VARCHAR(20) CHECK (role IN ('owner', 'admin', 'editor', 'viewer')),
--     created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
-- );

-- -- 创建资源表
-- CREATE TABLE IF NOT EXISTS resources (
--     resource_id VARCHAR(22) PRIMARY KEY,
--     user_id VARCHAR(22) REFERENCES users(user_id),
--     name VARCHAR(255),
--     resource_type VARCHAR(20) CHECK (resource_type IN ('doc', 'link', 'file', 'folder')),
--     parent_id VARCHAR(22),
--     tags JSONB,
--     content TEXT,
--     child_count INT DEFAULT 0,
--     created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
-- );

-- -- 创建任务表
-- CREATE TABLE IF NOT EXISTS tasks (
--     task_id VARCHAR(22) PRIMARY KEY,
--     namespace_id VARCHAR(22) NOT NULL,
--     user_id VARCHAR(22) REFERENCES users(user_id),
--     priority INT DEFAULT 0,
--     function TEXT NOT NULL,
--     input JSONB NOT NULL,
--     output JSONB,
--     exception JSONB,
--     started_at TIMESTAMP,
--     ended_at TIMESTAMP,
--     created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
-- );

-- -- 创建API密钥表
-- CREATE TABLE IF NOT EXISTS api_keys (
--     api_key VARCHAR(22) PRIMARY KEY,
--     user_id VARCHAR(22) REFERENCES users(user_id),
--     comment VARCHAR(32),
--     role JSONB NOT NULL DEFAULT '{}'::JSONB,
--     created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
-- );

-- 初始化管理员用户（密码：Admin@1234）
INSERT INTO users (user_id, username, email, password) 
VALUES (
  1,
  'admin', 
  'admin@example.com', 
  '$2b$10$6BpPl6i8pE5o5Z7hN8Qz0.3q1T4sWYd7JkMl2PvR1cLvV1XoY9JdC'
);

