/**
 * Hardcoded content of the welcome doc created in a new user's private root.
 *
 * Keep this file free of logic: language selection happens at the call site in
 * {@link NamespacesService.createUserNamespace}.
 */

const WELCOME_CONTENT_ZH = `**小黑 OmniBox——随时随地，将万物变成记忆，将记忆变成万物。**

## 一、随时随地

通过浏览器插件、移动端 App、微信/QQ 助手、RSS 和 Open API，随手保存网页、文件、图片、录音、视频与聊天消息，选择一个最符合你日常习惯的入口，让重要信息能够随时进入小黑。

[[text-color color="var(--tt-color-text)"]++安装浏览器插件，一键收藏网页++[/text-color]](https://www.omnibox.pro/docs/zh-cn/browser-extension#download)

[[text-color color="var(--tt-color-text)"]++下载移动端 App，从其他应用分享到小黑++[/text-color]](https://www.omnibox.pro/docs/zh-cn/download#mobile-app)

[[text-color color="var(--tt-color-text)"]++绑定微信助手 ，保存其中的内容++[/text-color]](https://www.omnibox.pro/docs/zh-cn/applications/wechat-assistant)

[[text-color color="var(--tt-color-text)"]++创建 RSS 订阅文件夹，持续接收关注的内容++[/text-color]](https://www.omnibox.pro/docs/zh-cn/knowledge-base/rss-folders)

[[text-color color="var(--tt-color-text)"]++使用快捷指令或 Open API，接入自己的工作流++[/text-color]](https://www.omnibox.pro/docs/zh-cn/open-api#external-agent-skill)

## 二、将万物变成记忆

不只是储存，而是越用越懂你的第二大脑。

小黑会自动解析内容，生成标题、摘要和标签，并通过文件夹、智能分类和语义搜索，把散落的信息整理成随时可以找到、阅读和调用的知识。

## 三、将记忆变成万物

你可以和知识库直接对话，让小黑总结资料、比较观点、提取待办，并生成文章、报告、清单和方案。Agent 还能帮你创建、编辑、移动和整理内容，让每一份记忆重新变成有价值的成果。

例如，你可以说：

> 根据录音，生成会议记录，提取结论、待办和风险，整理成一份周报。
>
> 把最近收藏的竞品资料按公司分类。先给我整理方案，暂时不要修改。
>
> 根据选中的三篇文章，生成一份包含核心观点、启发和行动建议的读书笔记。

你负责发现和思考，小黑负责接住、整理和推进～

现在，试着收藏你的第一份资料吧。

# 四、更多

- 阅读 [++使用指南++](https://www.omnibox.pro/docs/zh-cn/)，快速掌握小黑的功能与用法
- 加入 [++黑友社区++](https://www.omnibox.pro/community/)，交流使用心得，一起让小黑变得更好


`;

const WELCOME_CONTENT_EN = `**OmniBox — anywhere,anything to memory,memory to anything.**

## 1. Anywhere

Save web pages, files, images, voice notes, videos, and messages through the browser extension, mobile App, RSS, or Open API. Choose the option that fits naturally into your workflow, so anything worth keeping can go straight into OmniBox.

[Install the browser extension to save web pages in one click](https://www.omnibox.pro/docs/browser-extension#download)

[Download the mobile app and share content from other apps](https://www.omnibox.pro/docs/download#mobile-app)

[Connect the WeChat Assistant to save content from your chats](https://www.omnibox.pro/docs/applications/wechat-assistant)

[Create an RSS folder to automatically collect new content from your favorite sources](https://www.omnibox.pro/docs/knowledge-base/rss-folders)

[Use Apple Shortcuts or the Open API to connect OmniBox to your own workflows](https://www.omnibox.pro/docs/open-api#external-agent-skill)

## 2. Anything to memory

OmniBox does more than store your content. It becomes a second brain that understands you better the more you use it.

OmniBox automatically analyzes your content and generates titles, summaries, and tags. Folders, smart organization, and semantic search then turn scattered information into knowledge you can quickly find, read, and use.

## 3. Memory to anything

Chat directly with your knowledge base to summarize material, compare ideas, extract action items, and create articles, reports, checklists, or plans. The OmniBox Agent can also create, edit, move, and organize content for you, turning what you have saved into useful work.

For example, try asking:

> Based on this recording, create meeting notes with the key decisions, action items, and risks, then turn them into a weekly update.
>
> Organize the competitor research I saved recently by company. Show me your proposed structure first, but do not make any changes yet.
>
> Using the three selected articles, create reading notes that cover the main ideas, key takeaways, and recommended next steps.

You focus on discovering and thinking. OmniBox helps you capture, organize, and move things forward.

Ready to begin? Save your first item to OmniBox.

## 4. Learn more

- Read the [OmniBox User Manual](https://www.omnibox.pro/docs/) to explore features and workflows.
- Join the [OmniBox Community](https://www.omnibox.pro/community/) to share tips, ask questions, and help shape the product.


`;

export const WELCOME_CONTENT = {
  zh: {
    name: '欢迎使用小黑 OmniBox',
    content: WELCOME_CONTENT_ZH,
  },
  en: {
    name: 'Welcome to OmniBox',
    content: WELCOME_CONTENT_EN,
  },
};
