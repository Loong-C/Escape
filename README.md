# Escape

Escape 是一款 11 × 11 的双人抽象策略游戏。玩家在交点落桩，相邻同色桩自动形成墙，并通过改变四个出口的最短距离推动球逃离棋盘。

线上版本：[linkukai.com/games/Escape](https://linkukai.com/games/Escape/)

## 功能

- 六步交互教程，依次讲解落桩、浮桩与锚桩、墙、最短路径长度、球的自动移动、边界归属和封闭胜利。
- 人机对战随机分配黑白方，白方先行。
- 简单难度在棋盘四条边上显示落子前后的最短距离数字，不显示路径。
- 困难难度隐藏距离提示，并使用更深的搜索。
- 自我对弈强化学习价值网络，结合候选排序、迭代加深、Alpha-Beta 剪枝和置换表。
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

模型训练使用自我对弈 Monte Carlo 回报、经验回放、Adam 优化和逐步收敛的探索率。

```bash
pnpm exec tsx scripts/train-ai.ts \
  --episodes 10000 \
  --updates 32 \
  --candidates 24 \
  --checkpoint 500 \
  --output src/ai/model/escape-value.json
```

评测命令：

```bash
pnpm benchmark:ai -- --games 40 --time 40 --depth 1
```

随生产版本发布的模型完成了 10,000 局自我对弈训练。固定种子验收中，模型与规则启发式基线拥有相同的一层搜索和每步 40 ms 预算，轮换先后手进行 40 局，结果为 40 胜、0 负、0 和。困难模式实战另使用更长预算和迭代加深搜索。

训练完成后，将模型复制到 `public/ai/escape-value.json` 再构建生产版本。

## 部署

生产构建以 `/games/Escape/` 为基础路径。服务器结构、Nginx、HAProxy、Xray SNI 分流和不可变版本目录约定见 [deploy/README.md](deploy/README.md)。

完整游戏规则见 [docs/Rule.md](docs/Rule.md)。
