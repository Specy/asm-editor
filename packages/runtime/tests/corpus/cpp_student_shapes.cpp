// A typical student program: a class hierarchy with virtual functions, a dynamic array of base pointers,
// polymorphic output with printf, templates, references and operator overloading.
#include <cmath>
#include <cstdio>
#include <cstring>

class Shape {
public:
	explicit Shape(const char *name) { std::strncpy(name_, name, sizeof name_ - 1); name_[sizeof name_ - 1] = 0; }
	virtual ~Shape() = default;
	virtual double area() const = 0;
	virtual double perimeter() const = 0;
	const char *name() const { return name_; }
private:
	char name_[16];
};

class Circle : public Shape {
public:
	explicit Circle(double r) : Shape("circle"), r_(r) {}
	double area() const override { return M_PI * r_ * r_; }
	double perimeter() const override { return 2 * M_PI * r_; }
private:
	double r_;
};

class Rect : public Shape {
public:
	Rect(double w, double h) : Shape("rectangle"), w_(w), h_(h) {}
	double area() const override { return w_ * h_; }
	double perimeter() const override { return 2 * (w_ + h_); }
private:
	double w_, h_;
};

class Triangle : public Shape {
public:
	Triangle(double a, double b, double c) : Shape("triangle"), a_(a), b_(b), c_(c) {}
	double area() const override {
		double s = perimeter() / 2;
		return std::sqrt(s * (s - a_) * (s - b_) * (s - c_));
	}
	double perimeter() const override { return a_ + b_ + c_; }
private:
	double a_, b_, c_;
};

struct Vec {
	double x, y;
	Vec operator+(const Vec &o) const { return { x + o.x, y + o.y }; }
	Vec operator*(double k) const { return { x * k, y * k }; }
};

template <class T> T largest(const T *v, int n)
{
	T best = v[0];
	for (int i = 1; i < n; i++)
		if (v[i] > best) best = v[i];
	return best;
}

int main()
{
	Shape *shapes[] = { new Circle(1.5), new Rect(3, 4.5), new Triangle(3, 4, 5), new Circle(0.25) };
	double areas[4];
	for (int i = 0; i < 4; i++) {
		areas[i] = shapes[i]->area();
		std::printf("%-10s area=%8.3f perimeter=%8.3f\n", shapes[i]->name(), areas[i], shapes[i]->perimeter());
	}
	std::printf("largest area=%.3f\n", largest(areas, 4));
	int ints[] = { 3, 17, -4, 9 };
	std::printf("largest int=%d\n", largest(ints, 4));
	Vec v = Vec{ 1, 2 } + Vec{ 3, 4 } * 2;
	std::printf("vec=(%g, %g)\n", v.x, v.y);
	for (Shape *s : shapes) delete s;
	return 0;
}
