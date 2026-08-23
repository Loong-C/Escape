# Escape

Escape 是一款 11 × 11 的双人抽象策略游戏。玩家在交点落桩，相邻同色桩自动形成墙，并通过改变四个出口的最短距离推动球逃离棋盘。

线上版本：[linkukai.com/games/Escape](https://linkukai.com/games/Escape/)

## 功能

- 六步交互教程，依次讲解落桩、浮桩与锚桩、墙、最短路径长度、球的自动移动、边界归属和封闭胜利。
- 人机对战随机分配黑白方，白方先行。
- 简单难度在棋盘外的四条边显示最短距离；只有数值改变时才并列显示旧值与新值。若确认落桩后球会移动，还会显示虚线方向与落点轮廓，不显示完整路径。
- 困难难度隐藏距离与移动预览；两档使用完全相同的 AI 与搜索预算。
- 玩家所属的两条目标边会以克制的光带固定提示，不随回合切换。
- 128 维强化学习价值网络结合神经排序、迭代加深、Alpha-Beta 剪枝和置换表；局部输入包含以球为中心、按玩家视角规范化的 7 × 7 原始桩位与边界掩码。
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

模型从零开始使用自我对弈 Monte Carlo 终局回报、经验回放、Adam 优化和逐步收敛的探索率训练。每个局面同时记录行动方与等待方视角；初始课程从 3 × 3、5 × 5 的高密度封闭局面逐步过渡到标准 11 × 11，继续训练阶段固定使用正式 11 × 11 棋盘。

```bash
pnpm expand:ai -- \
  --input artifacts/models/base-summary-10000.json \
  --output artifacts/models/spatial-base-10000.json

pnpm train:ai -- \
  --resume artifacts/models/spatial-base-10000.json \
  --episodes 15000 \
  --size 11 \
  --updates 56 \
  --candidates 36 \
  --full-policy-rate 0.25 \
  --checkpoint 1000 \
  --checkpoint-dir artifacts/spatial-long-checkpoints \
  --output artifacts/models/spatial-long-25000.json
```

评测命令：

```bash
pnpm benchmark:ai -- --games 40 --time 40 --depth 1 --opening-plies 4
```

训练目标与运行时选择都不叠加人工局面分数或候选加分。模型只学习终局胜负回报；立即获胜与“对手下一手可获胜”的处理来自全合法着法的规则证明。搜索叶节点只读取训练后的神经价值。简单、困难两档都使用 12 秒预算与最高 5 层搜索，难度开关只控制提示是否显示。

本轮从原 10,000 局模型继续完成了 15,000 局标准 11 × 11 自我对弈，长训练耗时约 228 分钟并保留 15 个检查点。生产环境最终采用 19,000 局检查点：其中新增 9,000 局标准棋盘训练、927 次新增封闭获胜，累计包含 2,028 次封闭获胜。40 局成对随机开局评测中，它以 33:7 战胜原生产模型，以 36:3:1 战胜未训练的纯规则网络；检查点决赛又以 29:9:2 战胜 23,000 局检查点。正式 12 秒搜索在标准开局完成深度 4、评估 1,711 个节点。

训练完成后，将模型复制到 `public/ai/escape-value.json` 再构建生产版本。

## 部署

生产构建以 `/games/Escape/` 为基础路径。服务器结构、Nginx、HAProxy、Xray SNI 分流和不可变版本目录约定见 [deploy/README.md](deploy/README.md)。

完整游戏规则见 [docs/Rule.md](docs/Rule.md)。
