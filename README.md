# Escape

Escape 是一款 11 × 11 的双人抽象策略游戏。玩家在交点落桩，相邻同色桩自动形成墙，并通过改变四个出口的最短距离推动球逃离棋盘。

线上版本：[linkukai.com/games/Escape](https://linkukai.com/games/Escape/)

## 功能

- 六步交互教程，依次讲解落桩、浮桩与锚桩、墙、最短路径长度、球的自动移动、边界归属和封闭胜利。
- 人机对战随机分配黑白方，白方先行。
- 简单难度在棋盘外的四条边显示最短距离；只有数值改变时才并列显示旧值与新值，不显示路径。
- 困难难度隐藏距离提示，并使用更深的搜索。
- 当前玩家所属的两条目标边会以克制的光带提示。
- 仅使用终局奖励的自我对弈强化学习价值网络，结合神经排序、迭代加深、Alpha-Beta 剪枝和置换表。
- 键盘、触控、亮色、暗色与响应式布局支持。

## 本地开发

```bash
pnpm install
pnpm dev
```

开发地址为 `http://localhost:5173/games/Escape/`。

```bash
pnpm typecheck
pnpm test
pnpm build
```

## AI 训练与评测

模型从零开始使用自我对弈 Monte Carlo 终局回报、经验回放、Adam 优化和逐步收敛的探索率训练。每个局面同时记录行动方与等待方视角；课程从 3 × 3、5 × 5 的高密度封闭局面逐步过渡到标准 11 × 11 棋盘。

```bash
pnpm exec tsx scripts/train-ai.ts \
  --episodes 10000 \
  --hidden 64 \
  --updates 48 \
  --candidates 32 \
  --replay 120000 \
  --checkpoint 1000 \
  --checkpoint-dir artifacts/pure-rl-checkpoints \
  --output artifacts/models/pure-rl-10000.json
```

评测命令：

```bash
pnpm benchmark:ai -- --games 40 --time 40 --depth 1 --opening-plies 4
```

训练与运行时都不使用手写局面评分或人工候选优先级。模型只学习终局胜负回报；立即获胜与“对手下一手可获胜”的处理来自穷举规则证明，不是估值加分。困难模式使用 8 秒预算，搜索叶节点只读取训练后的神经价值。

当前生产模型从零完成 10,000 局双视角自我对弈，耗时约 45 分钟。训练终局包含 1,101 次封闭获胜，并有 2,175 局使用标准 11 × 11 棋盘。选模赛中，10,000 局检查点以 11:9 战胜 9,000 局检查点，其中 7 局通过封闭获胜；对未训练的纯规则网络进行 40 局成对随机开局评测，成绩为 33 胜、6 负、1 和。

训练完成后，将模型复制到 `public/ai/escape-value.json` 再构建生产版本。

## 部署

生产构建以 `/games/Escape/` 为基础路径。服务器结构、Nginx、HAProxy、Xray SNI 分流和不可变版本目录约定见 [deploy/README.md](deploy/README.md)。

完整游戏规则见 [docs/Rule.md](docs/Rule.md)。
