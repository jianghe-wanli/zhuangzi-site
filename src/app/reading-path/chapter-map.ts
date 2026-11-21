/** 问卷选项 → 推荐篇章。server 页面据此只把会被推荐到的篇章传给客户端岛。 */
export const CHAPTER_MAP: Record<string, string[]> = {
  anxiety: ["01-xiaoyao-you", "04-renjian-shi", "19-dasheng"],
  attachment: ["02-qiwu-lun", "17-qiushui", "20-shanmu"],
  conflict: ["04-renjian-shi", "05-dechong-fu", "23-gengsangchu"],
  meaning: ["02-qiwu-lun", "06-dazong-shi", "18-zhile"],
  peace: ["01-xiaoyao-you", "15-keyi", "19-dasheng"],
  wisdom: ["03-yangsheng-zhu", "04-renjian-shi", "20-shanmu"],
  transcend: ["01-xiaoyao-you", "02-qiwu-lun", "17-qiushui"],
};
