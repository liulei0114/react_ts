export { }
let myname: string = 'liulei'
let age: number = 19
let strList: String[] = ['1', '32', '43']
let strArr: Array<Number> = [23, 324]
// 元祖
let point: [number, number] = [3, 1]

// 枚举
enum Gender {
  BOY = 5,
  GIRL = 10
}

console.log(Gender.BOY, Gender.GIRL)


// 可能为空或者dom元素 HTMLElement 是ts提供的
let root: HTMLElement | null = document.getElementById('root');

// ！告诉ts别废话了不可能为空
root!.style.color = 'red'

function getName(name: string): void {
  console.log(name)
  // 严格模式关掉可以生效
  // return null return undifiend
}


let getUserName = (firstName: string, lastName: string) => {
  return {
    name: firstName + lastName
  }
}

// 函数重载
function sum(num1: number, num2: number): void
function sum(num1: string, num2: string): void
function sum(num1: any, num2: any): void {
  console.log(num1 + num2)
}

sum(1,2)
sum('1','2')
// sum(1,'2') // error

