/**
 * 30 款智能体专属 logo（透明背景，已压至 160px 供界面使用）。
 * id 与文件名一致；avatar 字段存 `logo-XX`。
 */
export const LOGOS = [
  {
    "id": "01",
    "label": "金黄探险家",
    "file": "01.png"
  },
  {
    "id": "02",
    "label": "蓝鲸学者",
    "file": "02.png"
  },
  {
    "id": "03",
    "label": "紫鲸宇航员",
    "file": "03.png"
  },
  {
    "id": "04",
    "label": "薄荷读书家",
    "file": "04.png"
  },
  {
    "id": "05",
    "label": "珊瑚手机控",
    "file": "05.png"
  },
  {
    "id": "06",
    "label": "青蓝侦察员",
    "file": "06.png"
  },
  {
    "id": "07",
    "label": "蜜桃小画家",
    "file": "07.png"
  },
  {
    "id": "08",
    "label": "海军蓝船长",
    "file": "08.png"
  },
  {
    "id": "09",
    "label": "草绿园艺师",
    "file": "09.png"
  },
  {
    "id": "10",
    "label": "番茄小主厨",
    "file": "10.png"
  },
  {
    "id": "11",
    "label": "靛蓝魔法师",
    "file": "11.png"
  },
  {
    "id": "12",
    "label": "橘色修理师",
    "file": "12.png"
  },
  {
    "id": "13",
    "label": "粉鲸音乐迷",
    "file": "13.png"
  },
  {
    "id": "14",
    "label": "冰蓝程序员",
    "file": "14.png"
  },
  {
    "id": "15",
    "label": "金色小王冠",
    "file": "15.png"
  },
  {
    "id": "16",
    "label": "翡翠忍者",
    "file": "16.png"
  },
  {
    "id": "17",
    "label": "青柠小医生",
    "file": "17.png"
  },
  {
    "id": "18",
    "label": "灰蓝侦探",
    "file": "18.png"
  },
  {
    "id": "19",
    "label": "丁香摄影师",
    "file": "19.png"
  },
  {
    "id": "20",
    "label": "朱红消防员",
    "file": "20.png"
  },
  {
    "id": "21",
    "label": "碧绿小邮差",
    "file": "21.png"
  },
  {
    "id": "22",
    "label": "玫瑰下午茶",
    "file": "22.png"
  },
  {
    "id": "23",
    "label": "荧绿游戏玩家",
    "file": "23.png"
  },
  {
    "id": "24",
    "label": "宝蓝建筑师",
    "file": "24.png"
  },
  {
    "id": "25",
    "label": "奶油小作家",
    "file": "25.png"
  },
  {
    "id": "26",
    "label": "银灰机器人",
    "file": "26.png"
  },
  {
    "id": "27",
    "label": "樱粉烘焙师",
    "file": "27.png"
  },
  {
    "id": "28",
    "label": "湖蓝潜水员",
    "file": "28.png"
  },
  {
    "id": "29",
    "label": "梅紫指挥家",
    "file": "29.png"
  },
  {
    "id": "30",
    "label": "日落旅行家",
    "file": "30.png"
  }
]

export function isLogoId(id) {
  return typeof id === 'string' && /^logo-[0-9]{2}$/.test(id)
    && LOGOS.some((item) => `logo-${item.id}` === id)
}
