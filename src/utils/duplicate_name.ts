export default function duplicateName(name: string) {
  if (!/\((\d+)\)$/.test(name)) {
    return `${name}(1)`;
  }

  return name.replace(/\((\d+)\)$/, (_, num) => {
    const nextNum = parseInt(num) + 1;
    return `(${nextNum})`;
  });
}
